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

// ── Gemini: chấm phát âm holistic (giống session-review) + transcribe ────
// Để Gemini tự đánh giá "completeness" (đã thử) không đáng tin — nó vẫn cho
// 100 điểm khi học viên cố ý nói thiếu câu. Nên completeness được tính lại
// cục bộ bằng Levenshtein (xem computeCompletenessScore) dựa trên transcript
// Gemini trả về so với reference_text, không lấy thẳng từ LLM.
async function scorePronunciation(
  audioBase64: string,
  mimeType: string,
  referenceText: string,
  languageId: string,
  geminiKey: string,
): Promise<{
  clarity: number;
  fluency: number;
  transcript: string;
  flagged_words: Array<{ word: string; tip: string }>;
}> {
  const lang = languageId === 'ja' ? 'Japanese' : 'English';

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              {
                text:
                  `This is a ${lang} learner recording. Reference sentence: "${referenceText}"\n` +
                  `Score this recording and respond with ONLY valid JSON:\n` +
                  `{"clarity":85,"fluency":80,"transcript":"exact words spoken","flagged_words":[{"word":"example","tip":"how to improve"}]}\n` +
                  `clarity: overall pronunciation clarity AND correct word stress 0-100.` +
                  `fluency: speaking flow AND natural intonation 0-100. ` +
                  `transcript: transcribe EXACTLY what was spoken, including mistakes/incomplete words. Do NOT correct or complete the sentence. If nothing audible, return "". ` +
                  `flagged_words: max 3 specific words that need improvement. The 'tip' in Vietnamese must provide actionable advice on pronunciation, wrong word stress, or unnatural intonation. ` +
                  `If pronunciation is good, flagged_words can be [].`,
              },
            ],
          },
        ],
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
    return { clarity: 0, fluency: 0, transcript: '', flagged_words: [] };
  }
}

// ── Levenshtein: chấm completeness cục bộ (đáng tin hơn để LLM tự đánh giá) ──
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
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

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

// Word-level alignment (Levenshtein ở mức từ, có backtrack) — so khớp theo vị trí cố
// định sẽ lệch toàn bộ phần còn lại của câu chỉ vì 1 từ bị tách/gộp khác số từ (ví dụ
// "the intercom" nghe thành "zincall"). Alignment tự "đồng bộ lại" sau lỗi cục bộ bằng
// cách cho phép xoá (từ ref bị thiếu trong recognized) / chèn (từ thừa) với chi phí cố
// định, và chỉ thay thế khi rẻ hơn xoá+chèn. Trả về, với mỗi từ ref, từ recognized
// được khớp (hoặc null nếu bị coi là thiếu).
function alignWords(refWords: string[], recWords: string[]): (string | null)[] {
  const m = refWords.length,
    n = recWords.length;
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) cost[i][0] = i;
  for (let j = 0; j <= n; j++) cost[0][j] = j;

  const subCost = (i: number, j: number) =>
    refWords[i - 1] === recWords[j - 1]
      ? 0
      : 1 - charSimilarity(refWords[i - 1], recWords[j - 1]) / 100;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + subCost(i, j), // khớp/thay thế
        cost[i - 1][j] + 1, // ref[i-1] bị thiếu trong recognized
        cost[i][j - 1] + 1, // recognized[j-1] là từ thừa
      );
    }
  }

  const aligned: (string | null)[] = new Array(m).fill(null);
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + subCost(i, j)) {
      aligned[i - 1] = recWords[j - 1];
      i--;
      j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      aligned[i - 1] = null;
      i--;
    } else {
      j--;
    }
  }
  return aligned;
}

// Tính completeness bằng word alignment: từ ref nào không khớp được với từ recognized
// nào đủ giống (do nói thiếu/dừng giữa câu) bị tính là "Omission".
function computeCompletenessScore(recognized: string, reference: string): number {
  const refWords = normalizeWords(reference);
  const recWords = normalizeWords(recognized);
  if (refWords.length === 0) return 0;

  const aligned = alignWords(refWords, recWords);
  const omittedCount = refWords.filter((refWord, i) => {
    const recWord = aligned[i];
    return recWord === null || charSimilarity(recWord, refWord) < 40;
  }).length;

  return Math.round(((refWords.length - omittedCount) / refWords.length) * 100);
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
      return Response.json(
        { error: 'Audio file not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    // Encode audio → base64 để gửi inline
    const audioBuffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const audioBase64 = btoa(binary);

    // Chấm clarity/fluency holistic bằng Gemini (giống session-review)
    const scores = await scorePronunciation(
      audioBase64,
      audio_mime_type,
      reference_text,
      language_id,
      geminiKey,
    );
    // completeness tính cục bộ bằng Levenshtein từ transcript Gemini trả về —
    // không tin LLM tự chấm điểm này (LLM vẫn cho 100 khi học viên nói thiếu câu)
    const completeness = computeCompletenessScore(scores.transcript, reference_text);
    const overall_score = Math.round((scores.clarity + scores.fluency + completeness) / 3);

    // Lưu attempt — accuracy_score = clarity (giống session-review), completeness_score
    // riêng cho pronounce vì có câu mẫu cố định để so sánh, word_scores chứa tip cải thiện
    await supabase.from('pronunciation_attempts').insert({
      user_id: user.id,
      language_id,
      scenario_line_id: scenario_line_id ?? null,
      message_id: message_id ?? null,
      audio_url: audio_storage_path,
      recognized_text: reference_text,
      overall_score,
      accuracy_score: scores.clarity,
      fluency_score: scores.fluency,
      completeness_score: completeness,
      word_scores: scores.flagged_words.map((fw) => ({
        word: fw.word,
        score: 0,
        error_type: fw.tip,
      })),
    });

    // Cập nhật user_progress nếu là kịch bản soạn sẵn
    if (scenario_line_id) {
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
                overall_score,
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
            best_pronunciation_score: overall_score,
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
      const newAvg =
        prevLines === 0
          ? overall_score
          : Math.round((prevAvg * prevLines + overall_score) / (prevLines + 1));
      await supabase
        .from('daily_activity')
        .update({ lines_practiced: prevLines + 1, avg_pronunciation_score: newAvg })
        .eq('id', todayAct.id);
    } else {
      await supabase.from('daily_activity').insert({
        user_id: user.id,
        activity_date: today,
        lines_practiced: 1,
        avg_pronunciation_score: overall_score,
      });
    }

    // Audio has been scored and result persisted — delete the file to free storage
    await supabase.storage.from('recordings').remove([audio_storage_path]);

    return Response.json(
      {
        overall_score,
        clarity: scores.clarity,
        fluency: scores.fluency,
        completeness,
        transcript: scores.transcript,
        flagged_words: scores.flagged_words,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
