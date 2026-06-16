import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface PronounceRequest {
  audio_storage_path: string;
  reference_text: string;
  language_id: 'en' | 'ja';
  /** MIME type của file audio — mặc định audio/wav */
  audio_mime_type?: string;
  scenario_line_id?: string;
  message_id?: string;
}

// ── Levenshtein scoring ───────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function charSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 100 : Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

function scoreWords(recognized: string, reference: string) {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);

  const refWords = normalize(reference);
  const recWords = normalize(recognized);

  return refWords.map((refWord, i) => {
    const recWord = recWords[i] ?? '';
    const score = charSimilarity(recWord, refWord);
    const error_type =
      recWord === '' ? 'Omission'
        : score < 60 ? 'Mispronunciation'
        : score < 85 ? 'UnexpectedBreak'
        : null;
    return { word: refWord, score, error_type };
  });
}

function computeScores(recognized: string, reference: string) {
  const wordScores = scoreWords(recognized, reference);

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);

  const refWords = normalize(reference);
  const recWords = normalize(recognized);

  const accuracy_score =
    wordScores.length > 0
      ? Math.round(wordScores.reduce((s, w) => s + w.score, 0) / wordScores.length)
      : 0;

  const completeness_score =
    refWords.length > 0
      ? Math.round((wordScores.filter((w) => w.error_type !== 'Omission').length / refWords.length) * 100)
      : 0;

  // fluency: phạt nếu số từ lệch nhiều so với câu mẫu
  const fluency_score =
    recWords.length > 0 && refWords.length > 0
      ? Math.round((Math.min(recWords.length, refWords.length) / Math.max(recWords.length, refWords.length)) * 100)
      : 0;

  const overall_score = Math.round((accuracy_score + fluency_score + completeness_score) / 3);

  return { overall_score, accuracy_score, fluency_score, completeness_score, word_scores: wordScores };
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user, supabase } = await verifyUser(req);
    const body: PronounceRequest = await req.json();
    const {
      audio_storage_path,
      reference_text,
      language_id,
      audio_mime_type = 'audio/wav',
      scenario_line_id,
      message_id,
    } = body;

    if (!scenario_line_id && !message_id) {
      return Response.json(
        { error: 'scenario_line_id or message_id is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    // Download audio từ private bucket "recordings"
    const { data: audioBlob, error: dlErr } = await supabase.storage
      .from('recordings')
      .download(audio_storage_path);

    if (dlErr || !audioBlob) {
      return Response.json({ error: 'Audio file not found' }, { status: 404, headers: corsHeaders });
    }

    // Encode audio → base64 để gửi inline
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    const langHint = language_id === 'ja' ? 'Japanese' : 'English';

    // Gọi Gemini để transcribe — không dùng files.upload() để tránh overhead
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: audio_mime_type,
                  data: audioBase64,
                },
              },
              {
                text:
                  `This is a ${langHint} language learning audio recording. ` +
                  `Transcribe exactly what is spoken, including any mistakes or incomplete words. ` +
                  `Do NOT correct errors. Return only the raw transcription text, nothing else.`,
              },
            ],
          }],
        }),
      },
    );

    if (!geminiResp.ok) {
      throw new Error(`Gemini STT error: ${await geminiResp.text()}`);
    }

    const geminiData = await geminiResp.json();
    const recognized_text: string =
      (geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

    // Tính điểm bằng Levenshtein
    const scores = computeScores(recognized_text, reference_text);

    // Lưu attempt
    await supabase.from('pronunciation_attempts').insert({
      user_id: user.id,
      language_id,
      scenario_line_id: scenario_line_id ?? null,
      message_id: message_id ?? null,
      audio_url: audio_storage_path,
      recognized_text,
      ...scores,
    });

    // Cập nhật user_progress nếu là kịch bản soạn sẵn
    if (scenario_line_id && scores.overall_score !== null) {
      const { data: line } = await supabase
        .from('scenario_lines')
        .select('scenario_id')
        .eq('id', scenario_line_id)
        .single();

      if (line) {
        const { data: existing } = await supabase
          .from('user_progress')
          .select('id, best_pronunciation_score, attempts_count')
          .eq('user_id', user.id)
          .eq('scenario_id', line.scenario_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_progress')
            .update({
              best_pronunciation_score: Math.max(
                existing.best_pronunciation_score ?? 0,
                scores.overall_score,
              ),
              attempts_count: existing.attempts_count + 1,
              last_studied_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('user_progress').insert({
            user_id: user.id,
            scenario_id: line.scenario_id,
            language_id,
            best_pronunciation_score: scores.overall_score,
            attempts_count: 1,
            last_studied_at: new Date().toISOString(),
          });
        }
      }
    }

    // Upsert daily_activity (lines + running-average score)
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAct } = await supabase
      .from('daily_activity')
      .select('id, lines_practiced, avg_pronunciation_score')
      .eq('user_id', user.id)
      .eq('activity_date', today)
      .maybeSingle();

    if (todayAct) {
      const prevAvg = todayAct.avg_pronunciation_score ?? 0;
      const prevLines = todayAct.lines_practiced;
      const newAvg = prevLines === 0
        ? scores.overall_score
        : Math.round((prevAvg * prevLines + (scores.overall_score ?? 0)) / (prevLines + 1));
      await supabase
        .from('daily_activity')
        .update({ lines_practiced: prevLines + 1, avg_pronunciation_score: newAvg })
        .eq('id', todayAct.id);
    } else {
      await supabase.from('daily_activity').insert({
        user_id: user.id,
        activity_date: today,
        lines_practiced: 1,
        avg_pronunciation_score: scores.overall_score,
      });
    }

    return Response.json({ recognized_text, ...scores }, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
