import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface ReviewRequest {
  conversation_id: string;
  language_id: 'en' | 'ja';
  /** Full transcript — cả user + assistant */
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
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
    // Strip possible markdown fences (Claude sometimes wraps JSON in ```json ... ```)
    const cleaned = raw
      .replace(/^```[a-z]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return { overall_feedback: '', fluency_notes: '', corrections: [], vocab_to_learn: [] };
  }
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user, supabase } = await verifyUser(req);
    const body: ReviewRequest = await req.json();
    const { conversation_id, language_id, transcript } = body;

    console.log(
      `[session-review] user=${user.id} conv=${conversation_id} turns=${transcript?.length}`,
    );

    // Verify conversation belongs to this user (query by id only to avoid user_id mismatch masking)
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) {
      console.error(`[session-review] conv not found by id: convErr=${convErr?.message}`);
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404, headers: corsHeaders },
      );
    }
    if (conv.user_id !== user.id) {
      console.error(
        `[session-review] user_id mismatch: conv.user_id=${conv.user_id} user.id=${user.id}`,
      );
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

    // ── Chấm phát âm đã xong từ trước (Azure, theo từng câu nói — xem pronounce
    // score_only) — client insert pronunciation_attempts trước khi gọi function này.
    // Ở đây chỉ TỔNG HỢP avg_pronunciation, không chấm audio nữa.
    const avgPronunciationPromise = (async (): Promise<number | null> => {
      const { data: userMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('role', 'user');

      const messageIds = (userMessages ?? []).map((m: { id: string }) => m.id);
      if (messageIds.length === 0) return null;

      const { data: attempts } = await supabase
        .from('pronunciation_attempts')
        .select('accuracy_score')
        .in('message_id', messageIds);

      const scores = (attempts ?? [])
        .map((a: { accuracy_score: number | null }) => a.accuracy_score)
        .filter((s): s is number => s != null);

      return scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : null;
    })();

    const [grammarResult, avgPronunciation] = await Promise.all([
      analyzeGrammar(transcript, language_id, anthropicKey),
      avgPronunciationPromise,
    ]);

    // Persist summary onto the conversation
    await supabase
      .from('conversations')
      .update({
        summary: {
          recurring_errors:
            grammarResult.corrections?.map((c: { original: string }) => c.original) ?? [],
          corrections: grammarResult.corrections ?? [],
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
