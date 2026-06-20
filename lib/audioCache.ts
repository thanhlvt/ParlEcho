import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { logError } from './sentry';

const LIVE_AUDIO_DIR = `${FileSystem.documentDirectory}live/`;

/**
 * Lấy tổng dung lượng các file âm thanh đã lưu (tính bằng byte)
 */
export async function getAudioCacheSize(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LIVE_AUDIO_DIR);
    if (!dirInfo.exists || !dirInfo.isDirectory) return 0;

    let totalSize = 0;
    const conversations = await FileSystem.readDirectoryAsync(LIVE_AUDIO_DIR);
    for (const conv of conversations) {
      const convDir = `${LIVE_AUDIO_DIR}${conv}/`;
      const files = await FileSystem.readDirectoryAsync(convDir);
      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${convDir}${file}`);
        if (fileInfo.exists && !fileInfo.isDirectory && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }
    }
    return totalSize;
  } catch (err) {
    console.warn('getAudioCacheSize error:', err);
    return 0;
  }
}

/**
 * Xóa toàn bộ file âm thanh đã lưu nội bộ
 */
export async function clearAllAudioCache() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LIVE_AUDIO_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(LIVE_AUDIO_DIR, { idempotent: true });
    }

    // Xóa liên kết URL ở Supabase cho các file local
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('messages')
        .update({ audio_url: null })
        .eq('user_id', user.id)
        .like('audio_url', 'file://%');
    }
  } catch (err) {
    logError('AudioCache.clearAll', err);
  }
}

/**
 * Xóa các file âm thanh của một phiên cụ thể
 */
export async function clearConversationAudio(conversationId: string) {
  try {
    const convDir = `${LIVE_AUDIO_DIR}${conversationId}/`;
    const dirInfo = await FileSystem.getInfoAsync(convDir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(convDir, { idempotent: true });
    }

    // Xóa liên kết URL ở Supabase
    await supabase
      .from('messages')
      .update({ audio_url: null })
      .eq('conversation_id', conversationId)
      .like('audio_url', 'file://%');
  } catch (err) {
    logError('AudioCache.clearConversation', err);
  }
}
