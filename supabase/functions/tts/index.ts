import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface TtsRequest {
  text: string;
  language_id: 'en' | 'ja';
  /** Gemini prebuilt voice name — mặc định Kore */
  voice?: string;
  scenario_line_id?: string;
}

// Gemini TTS dùng chung voice cho mọi ngôn ngữ (multilingual)
const DEFAULT_VOICE = 'Kore';

// ── WAV header builder (24kHz, 16-bit, mono — output của Gemini TTS) ──
function buildWavBuffer(pcmData: Uint8Array): Uint8Array {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitDepth = 16;
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const dataLength = pcmData.length;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  const wav = new Uint8Array(44 + dataLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcmData, 44);
  return wav;
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { supabase } = await verifyUser(req);
    const body: TtsRequest = await req.json();
    const { text, language_id, voice, scenario_line_id } = body;

    // Trả cache nếu đã có
    if (scenario_line_id) {
      const { data: line } = await supabase
        .from('scenario_lines')
        .select('audio_url')
        .eq('id', scenario_line_id)
        .single();

      if (line?.audio_url) {
        return Response.json({ audio_url: line.audio_url }, { headers: corsHeaders });
      }
    }

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    const selectedVoice = voice ?? DEFAULT_VOICE;

    // Gọi Gemini TTS API
    // gemini-3.1-flash-tts-preview is the newest TTS model (as of June 2026)
    // gemini-2.5-flash-preview-tts returns finishReason: "OTHER" (model-side failure)
    const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        }),
      },
    );

    if (!geminiResp.ok) {
      throw new Error(`Gemini TTS error: ${await geminiResp.text()}`);
    }

    const geminiData = await geminiResp.json();

    // Log structure for debugging (truncate data fields to avoid huge logs)
    const debugData = JSON.stringify(geminiData, (key, val) =>
      key === 'data' && typeof val === 'string' ? `<base64 ${val.length}chars>` : val
    );
    console.log('[tts] Gemini response structure:', debugData.substring(0, 1000));

    // Search all parts for inlineData audio (not just parts[0])
    const parts: Array<Record<string, unknown>> =
      geminiData.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find(
      (p) => (p.inlineData as Record<string, unknown> | undefined)?.mimeType?.toString().startsWith('audio'),
    );
    const pcmBase64: string =
      (audioPart?.inlineData as Record<string, unknown> | undefined)?.data as string ?? '';

    if (!pcmBase64) {
      throw new Error(
        `Gemini TTS returned no audio data. Structure: ${debugData.substring(0, 400)}`,
      );
    }

    // Decode base64 PCM → Uint8Array
    const binaryStr = atob(pcmBase64);
    const pcmData = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      pcmData[i] = binaryStr.charCodeAt(i);
    }

    // Gói PCM vào WAV container
    const wavData = buildWavBuffer(pcmData);

    // Upload lên Storage bucket "tts" (public)
    const fileName = `tts/${language_id}/${crypto.randomUUID()}.wav`;
    const { error: uploadErr } = await supabase.storage
      .from('tts')
      .upload(fileName, wavData, { contentType: 'audio/wav' });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from('tts').getPublicUrl(fileName);

    // Cache vào scenario_line nếu có
    if (scenario_line_id) {
      await supabase
        .from('scenario_lines')
        .update({ audio_url: publicUrl })
        .eq('id', scenario_line_id);
    }

    return Response.json({ audio_url: publicUrl }, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
