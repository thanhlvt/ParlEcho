import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface AudioSegmentInput {
  message_id: string;
  audio_storage_path: string;
  text: string;
  sort_order: number;
}

interface ReviewRequest {
  conversation_id: string;
  language_id: 'en' | 'ja';
  /** Full transcript — cả user + assistant */
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** Chỉ các đoạn user, kèm đường dẫn audio để chấm phát âm */
  user_segments: AudioSegmentInput[];
}

// ── Claude: phân tích ngữ pháp + từ vựng ─────────────────────────────
async function analyzeGrammar(
  transcript: ReviewRequest['transcript'],
  languageId: string,
  anthropicKey: string,
) {
  const lang = languageId === 'ja' ? 'Japanese' : 'English';
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Learner' : 'AI'}: ${t.text}`)
    .join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        `You are an expert ${lang} teacher reviewing a conversation between a Vietnamese learner and an AI partner. ` +
        `Respond with ONLY valid JSON, no markdown, no preamble:\n` +
        `{\n` +
        `  "overall_feedback": "1-2 sentence encouraging overall assessment in Vietnamese",\n` +
        `  "fluency_notes": "brief note on speaking flow in Vietnamese",\n` +
        `  "corrections": [{"original":"exact mistake","fixed":"corrected form","explanation":"brief explanation in Vietnamese"}],\n` +
        `  "vocab_to_learn": ["word or phrase worth memorizing"]\n` +
        `}\n` +
        `Rules: corrections[] only for real mistakes (grammar, word choice, unnatural phrasing). Max 5 corrections. Max 5 vocab items.`,
      messages: [{ role: 'user', content: `Transcript:\n${transcriptText}` }],
    }),
  });

  if (!resp.ok) throw new Error(`Claude error: ${await resp.text()}`);
  const data = await resp.json();
  const raw: string = data.content[0]?.text ?? '{}';

  try {
    return JSON.parse(raw);
  } catch {
    return { overall_feedback: raw, fluency_notes: '', corrections: [], vocab_to_learn: [] };
  }
}

// ── Gemini: chấm phát âm holistic cho 1 đoạn audio ──────────────────
async function scorePronunciation(
  audioBase64: string,
  mimeType: string,
  referenceText: string,
  languageId: string,
  geminiKey: string,
): Promise<{ clarity: number; fluency: number; flagged_words: Array<{ word: string; tip: string }> }> {
  const lang = languageId === 'ja' ? 'Japanese' : 'English';

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            {
              text:
                `This is a ${lang} learner recording. Reference sentence: "${referenceText}"\n` +
                `Score this recording and respond with ONLY valid JSON:\n` +
                `{"clarity":85,"fluency":80,"flagged_words":[{"word":"example","tip":"how to improve"}]}\n` +
                `clarity: overall pronunciation clarity 0-100. fluency: speaking flow 0-100. ` +
                `flagged_words: max 3 specific words that need improvement with short actionable tips in Vietnamese. ` +
                `If pronunciation is good, flagged_words can be [].`,
            },
          ],
        }],
      }),
    },
  );

  if (!resp.ok) throw new Error(`Gemini pronunciation error: ${await resp.text()}`);
  const data = await resp.json();
  const raw: string = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

  try {
    // Strip possible markdown fences
    const json = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(json);
  } catch {
    return { clarity: 0, fluency: 0, flagged_words: [] };
  }
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user, supabase } = await verifyUser(req);
    const body: ReviewRequest = await req.json();
    const { conversation_id, language_id, transcript, user_segments } = body;

    // Verify conversation belongs to this user
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .single();

    if (convErr || !conv) {
      return Response.json({ error: 'Conversation not found' }, { status: 404, headers: corsHeaders });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    // ── Run grammar analysis + pronunciation scoring in parallel ──────
    const [grammarResult, pronunciationResults] = await Promise.all([
      analyzeGrammar(transcript, language_id, anthropicKey),

      Promise.all(
        user_segments.map(async (seg) => {
          try {
            const { data: audioBlob, error: dlErr } = await supabase.storage
              .from('recordings')
              .download(seg.audio_storage_path);

            if (dlErr || !audioBlob) {
              return {
                message_id: seg.message_id,
                sort_order: seg.sort_order,
                text: seg.text,
                clarity: 0,
                fluency: 0,
                flagged_words: [] as Array<{ word: string; tip: string }>,
              };
            }

            const audioBuffer = await audioBlob.arrayBuffer();
            const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
            // Recordings uploaded as WAV (user audio wrapped with WAV header)
            const scores = await scorePronunciation(
              audioBase64,
              'audio/wav',
              seg.text,
              language_id,
              geminiKey,
            );

            // Persist as pronunciation_attempt linked to message_id
            await supabase.from('pronunciation_attempts').insert({
              user_id: user.id,
              language_id,
              message_id: seg.message_id,
              audio_url: seg.audio_storage_path,
              recognized_text: seg.text,
              overall_score: scores.clarity,
              accuracy_score: scores.clarity,
              fluency_score: scores.fluency,
              completeness_score: null,
              word_scores: scores.flagged_words.map((fw) => ({
                word: fw.word,
                score: 0,
                error_type: fw.tip,
              })),
            });

            return {
              message_id: seg.message_id,
              sort_order: seg.sort_order,
              text: seg.text,
              ...scores,
            };
          } catch (err) {
            console.error(`[session-review] pronunciation failed for ${seg.message_id}:`, err);
            return {
              message_id: seg.message_id,
              sort_order: seg.sort_order,
              text: seg.text,
              clarity: 0,
              fluency: 0,
              flagged_words: [] as Array<{ word: string; tip: string }>,
            };
          }
        }),
      ),
    ]);

    const avgPronunciation =
      pronunciationResults.length > 0
        ? Math.round(
            pronunciationResults.reduce((s, p) => s + p.clarity, 0) / pronunciationResults.length,
          )
        : null;

    // Persist summary onto the conversation
    await supabase
      .from('conversations')
      .update({
        summary: {
          recurring_errors: grammarResult.corrections?.map((c: { original: string }) => c.original) ?? [],
          words_to_learn: grammarResult.vocab_to_learn ?? [],
          overall_feedback: grammarResult.overall_feedback ?? '',
          fluency_notes: grammarResult.fluency_notes ?? '',
          avg_pronunciation: avgPronunciation,
        },
        ended_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    // Bump daily_activity conversations_count
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAct } = await supabase
      .from('daily_activity')
      .select('id, conversations_count')
      .eq('user_id', user.id)
      .eq('activity_date', today)
      .maybeSingle();

    if (todayAct) {
      await supabase
        .from('daily_activity')
        .update({ conversations_count: todayAct.conversations_count + 1 })
        .eq('id', todayAct.id);
    } else {
      await supabase.from('daily_activity').insert({
        user_id: user.id,
        activity_date: today,
        conversations_count: 1,
      });
    }

    const result = {
      overall_feedback: grammarResult.overall_feedback ?? '',
      fluency_notes: grammarResult.fluency_notes ?? '',
      corrections: grammarResult.corrections ?? [],
      vocab_to_learn: grammarResult.vocab_to_learn ?? [],
      pronunciation: pronunciationResults,
      avg_pronunciation: avgPronunciation,
    };

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    console.error('[session-review]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
