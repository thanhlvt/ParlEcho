export const SESSION_LIMIT_MINUTES = 14; // Gemini Live cap ~15 min; auto-end at 14

export const VOICES = [
  { id: 'Puck', desc: 'Vui vẻ' },
  { id: 'Charon', desc: 'Điềm tĩnh' },
  { id: 'Kore', desc: 'Rõ ràng' },
  { id: 'Fenrir', desc: 'Sôi nổi' },
  { id: 'Aoede', desc: 'Nhẹ nhàng' },
  { id: 'Leda', desc: 'Trẻ trung' },
  { id: 'Orus', desc: 'Mạnh mẽ' },
  { id: 'Zephyr', desc: 'Trầm ấm' },
  { id: 'Schedar', desc: 'Trung lập' },
  { id: 'Achernar', desc: 'Linh hoạt' },
] as const;
export type VoiceId = (typeof VOICES)[number]['id'];

export const SPEAKING_STYLES = [
  { id: 'casual', label: 'Casual', icon: '😊' },
  { id: 'formal', label: 'Lịch sự', icon: '🤝' },
  { id: 'workplace', label: 'Công sở', icon: '💼' },
  { id: 'beginner', label: 'Nói chậm', icon: '🐢' },
  { id: 'children', label: 'Cho trẻ em', icon: '🧒' },
] as const;
export type SpeakingStyleId = (typeof SPEAKING_STYLES)[number]['id'];

export const CONVERSATION_METHODS = [
  { id: 'free_talk', label: 'Nói tự do', icon: '💬' },
  { id: 'consulting', label: 'Tư vấn', icon: '🤔' },
  { id: 'interview', label: 'Phỏng vấn', icon: '📋' },
  { id: 'empathetic', label: 'Thấu cảm', icon: '💝' },
  { id: 'pressure', label: 'Gây áp lực', icon: '🔥' },
] as const;
export type ConversationMethodId = (typeof CONVERSATION_METHODS)[number]['id'];

export type ViewState = 'setup' | 'connecting' | 'live' | 'saving';

export type AccentId = 'en-US' | 'en-UK';
