import { supabase } from './supabase';
import { pcmToWav } from './audioFormat';
import { LanguageId, PronounceApiResponse } from './types';

/**
 * Chấm phát âm 1 câu nói (unscripted, score_only) ngay trong lúc phiên Live/Kid đang diễn ra —
 * upload tạm lên Storage, gọi /pronounce với score_only=true (không ghi DB phía edge function,
 * trả điểm rồi tự xoá file), trả null nếu lỗi để không làm gãy phiên đang chạy.
 */
export async function scoreUtterance(
  userId: string,
  pcm: Uint8Array,
  languageId: LanguageId,
  accent?: string,
): Promise<PronounceApiResponse | null> {
  if (pcm.length === 0) return null;
  try {
    const wav = pcmToWav(pcm, 16000, 16);
    const path = `${userId}/scoring/${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;

    const { error: uploadErr } = await supabase.storage
      .from('recordings')
      .upload(path, wav.buffer as ArrayBuffer, { contentType: 'audio/wav', upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data, error } = await supabase.functions.invoke<PronounceApiResponse>('pronounce', {
      body: {
        audio_storage_path: path,
        language_id: languageId,
        audio_mime_type: 'audio/wav',
        score_only: true,
        accent,
      },
    });
    if (error) throw new Error(error.message);
    return data ?? null;
  } catch (err) {
    console.warn('[scoreUtterance] failed:', err);
    return null;
  }
}
