import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';
import {
  assessPronunciation,
  mergeClarityFluency,
  pickFlaggedWords,
  toAzureLocale,
} from '../_shared/azurePronunciation.ts';

interface PronounceRequest {
  audio_storage_path: string;
  /** Câu mẫu để chấm scripted (rỗng/không truyền => unscripted, dùng cho score_only) */
  reference_text?: string;
  language_id: 'en' | 'ja';
  /** MIME type của file audio — hiện chỉ hỗ trợ audio/wav (PCM 16kHz/16-bit/mono, do
   *  Azure Pronunciation Assessment yêu cầu; m4a/AAC chưa decode được trong Deno) */
  audio_mime_type?: string;
  scenario_line_id?: string;
  message_id?: string;
  /** true => chỉ trả điểm, KHÔNG ghi pronunciation_attempts/user_progress/daily_activity.
   *  Dùng cho chấm theo từng câu nói (Live/Kid) — message_id chưa tồn tại lúc gọi, sẽ insert
   *  pronunciation_attempts từ client ở cuối phiên (xem useLiveSession/useMissionSession). */
  score_only?: boolean;
  /** Accent cho tiếng Anh (vd 'en-US', 'en-GB') — mặc định en-US */
  accent?: string;
}

// WAV do app tạo (lib/audioFormat.ts#pcmToWav) luôn có header cố định 44 byte.
function stripWavHeader(wavBytes: Uint8Array): Uint8Array {
  return wavBytes.subarray(44);
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
      score_only = false,
      accent,
    } = body;

    if (!score_only && !scenario_line_id && !message_id) {
      return Response.json(
        { error: 'scenario_line_id or message_id is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (audio_mime_type !== 'audio/wav') {
      return Response.json(
        {
          error: `Unsupported audio_mime_type "${audio_mime_type}" — Azure Pronunciation Assessment chỉ nhận PCM WAV 16kHz/16-bit/mono.`,
        },
        { status: 400, headers: corsHeaders },
      );
    }

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

    const audioBuffer = await audioBlob.arrayBuffer();
    const pcm = stripWavHeader(new Uint8Array(audioBuffer));

    const azureResult = await assessPronunciation({
      pcm,
      sampleRate: 16000,
      locale: toAzureLocale(language_id, accent),
      referenceText: reference_text || undefined,
    });

    if (score_only && !azureResult.recognized) {
      // Azure không nhận diện được giọng nói (NoMatch — hay gặp với câu rất ngắn như
      // "はい."/"yes.", dù Gemini Live vẫn transcribe được trong ngữ cảnh hội thoại). KHÔNG
      // trả điểm 0 giả — báo recognized:false để client (lib/pronunciationScoring.ts) bỏ qua
      // hẳn câu này, không insert pronunciation_attempts, không tính vào avg_pronunciation.
      await supabase.storage.from('recordings').remove([audio_storage_path]);
      return Response.json({ recognized: false }, { headers: corsHeaders });
    }

    const { clarity, fluency } = mergeClarityFluency(azureResult);
    const flagged_words = pickFlaggedWords(azureResult.words);

    // completeness chỉ áp dụng khi có câu mẫu cố định (scripted) — dùng thẳng CompletenessScore
    // của Azure (tự so khớp transcript với reference_text). Unscripted (score_only, Live/Kid
    // chấm theo từng câu nói tự do) không có khái niệm "đủ câu" để so khớp — Azure vẫn trả 100
    // (mặc định coi là "đủ") khi không có reference_text nên PHẢI tự ép null ở đây, không dùng
    // thẳng giá trị Azure trả về.
    const completeness = reference_text ? azureResult.completeness : null;
    // Giữ đúng công thức cũ: scripted = trung bình 3 trục; unscripted = lấy clarity (khớp
    // hành vi session-review hiện tại, tránh lệch ngưỡng sao 70/85 đã tune trước đó).
    const overall_score =
      completeness !== null ? Math.round((clarity + fluency + completeness) / 3) : clarity;

    if (score_only) {
      // Chấm theo câu nói trong lúc Live/Kid đang diễn ra — chưa có message_id, không ghi DB.
      // Client sẽ insert pronunciation_attempts từ kết quả này ở cuối phiên.
      await supabase.storage.from('recordings').remove([audio_storage_path]);
      return Response.json(
        {
          recognized: true,
          overall_score,
          clarity,
          fluency,
          completeness,
          transcript: azureResult.transcript,
          flagged_words,
        },
        { headers: corsHeaders },
      );
    }

    // Lưu attempt — accuracy_score = clarity (giống session-review), word_scores chứa tip
    // cải thiện (không phải mã lỗi thô của Azure)
    await supabase.from('pronunciation_attempts').insert({
      user_id: user.id,
      language_id,
      scenario_line_id: scenario_line_id ?? null,
      message_id: message_id ?? null,
      audio_url: audio_storage_path,
      recognized_text: reference_text ?? azureResult.transcript,
      overall_score,
      accuracy_score: clarity,
      fluency_score: fluency,
      completeness_score: completeness,
      word_scores: flagged_words.map((fw) => ({
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
        recognized: azureResult.recognized,
        overall_score,
        clarity,
        fluency,
        completeness,
        transcript: azureResult.transcript,
        flagged_words,
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
