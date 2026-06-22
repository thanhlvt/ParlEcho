// TypeScript types khớp với schema.sql

export type LanguageId = 'en' | 'ja';

export type Language = {
  id: LanguageId;
  name: string;
  tts_voice: string | null;
  stt_locale: string;
};

export type ScenarioLevel = 'beginner' | 'intermediate' | 'advanced';
export type ScenarioType = 'scripted' | 'ai_roleplay' | 'pronunciation';
export type LineSpeaker = 'user' | 'partner';
export type ConversationMode =
  | 'roleplay'
  | 'exam'
  | 'journaling'
  | 'code_switch'
  | 'free_talk'
  | 'kid_guided'
  | 'kid_exploration';
export type MessageRole = 'user' | 'assistant' | 'system';
export type ProgressStatus = 'locked' | 'in_progress' | 'completed';
export type SavedItemType = 'word' | 'phrase' | 'mistake';

export type ScenarioGroup = {
  id: string;
  slug: string;
  category: string;
  created_at: string;
};

export type Scenario = {
  id: string;
  group_id: string;
  language_id: LanguageId;
  title: string;
  description: string | null;
  level: ScenarioLevel;
  type: ScenarioType;
  icon: string | null;
  sort_order: number;
  created_at: string;
};

export type ScenarioLine = {
  id: string;
  scenario_id: string;
  language_id: LanguageId;
  sort_order: number;
  speaker: LineSpeaker;
  text: string;
  translation: string | null;
  furigana: string | null;
  romaji: string | null;
  phonetic: string | null;
  audio_url: string | null;
  created_at: string;
};

// Kid Mode: nhân vật đồng hành (bảng companions)
export type Companion = {
  id: string;
  name: string;
  personality: string;
  accent_color: string;
  sort_order: number;
};

// Kid Mode: nhiệm vụ hội thoại có cấu trúc (bảng missions/mission_steps)
export type Mission = {
  id: string;
  language_id: LanguageId;
  title: string;
  topic: string;
  level: ScenarioLevel;
  step_count: number;
  sticker_pool: string[];
  icon: string;
  created_at: string;
};

export type MissionStep = {
  id: string;
  mission_id: string;
  step_order: number;
  target_sentence: string;
  intent: string;
};

// Kid Mode: Reward System (Pha 3)
export type Sticker = {
  id: string;
  name: string;
  theme: string;
  emoji: string;
  sort_order: number;
};

export type Costume = {
  id: string;
  companion_id: string;
  name: string;
  emoji: string;
  sort_order: number;
  price_biscuits: number;
};

export type UserSticker = {
  id: string;
  user_id: string;
  sticker_id: string;
  unlocked_at: string;
};

export type UserCostume = {
  id: string;
  user_id: string;
  costume_id: string;
  unlocked_at: string;
};

export type MissionResult = {
  id: string;
  user_id: string;
  mission_id: string;
  conversation_id: string | null;
  stars: number;
  used_hint: boolean;
  completed_at: string;
};

// Kid Mode: ảnh cho Image Exploration Mission (Pha 5 — bảng exploration_images)
export type ExplorationImage = {
  id: string;
  uploader: string | null;
  storage_path: string;
  is_approved: boolean;
  safesearch_result: Record<string, unknown> | null;
  created_at: string;
};

// Kid Mode: kết quả mỗi lần khám phá xong 1 ảnh (tương tự MissionResult nhưng theo ảnh)
export type ExplorationResult = {
  id: string;
  user_id: string;
  exploration_image_id: string;
  conversation_id: string | null;
  stars: number;
  completed_at: string;
};

// Kid Mode: đếm thời lượng dùng app/ngày (Pha 4 — Screen Time)
export type DailyKidUsage = {
  id: string;
  user_id: string;
  activity_date: string;
  seconds_used: number;
};

// Kid Mode: từ vựng/câu phụ huynh ưu tiên — đẩy lên đầu danh sách mission (Pha 6)
export type PriorityVocab = {
  id: string;
  user_id: string;
  language_id: LanguageId;
  content: string;
  created_at: string;
};

export type Profile = {
  id: string;
  name: string | null;
  active_language_id: LanguageId;
  // ── Kid Mode ──────────────────────────────────────────────────────────
  is_kid_mode: boolean;
  parent_pin: string | null;
  companion_id: string | null;
  active_costume_id: string | null;
  screen_time_limit_minutes: number;
  child_name: string | null;
  child_level: string | null;
  biscuit_count: number;
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = {
  recurring_errors?: string[];
  corrections?: Correction[];
  words_to_learn?: string[];
  /** Điểm phát âm trung bình của phiên (live) */
  avg_pronunciation?: number | null;
  /** Nhận xét tổng quan cuối phiên */
  overall_feedback?: string;
  /** Nhận xét về độ trôi chảy */
  fluency_notes?: string;
  /** Kid Mode (guided): sort_order các lượt AI báo trẻ lạc đề — Parent Dashboard đánh dấu (Pha 6) */
  offtopic_turns?: number[];
};

export type Conversation = {
  id: string;
  user_id: string;
  scenario_id: string | null;
  mission_id: string | null;
  language_id: LanguageId;
  mode: ConversationMode;
  summary: ConversationSummary | null;
  started_at: string;
  ended_at: string | null;
};

export type Correction = {
  original: string;
  fixed: string;
  explanation: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  sort_order: number;
  text: string;
  translation: string | null;
  furigana: string | null;
  romaji: string | null;
  audio_url: string | null;
  corrections: Correction[] | null;
  hints: string[] | null;
  created_at: string;
};

export type WordScore = {
  word: string;
  score: number;
  error_type: string | null;
};

export type PronunciationAttempt = {
  id: string;
  user_id: string;
  language_id: LanguageId;
  scenario_line_id: string | null;
  message_id: string | null;
  audio_url: string | null;
  recognized_text: string | null;
  overall_score: number | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  word_scores: WordScore[] | null;
  created_at: string;
};

export type UserProgress = {
  id: string;
  user_id: string;
  scenario_id: string;
  language_id: LanguageId;
  status: ProgressStatus;
  best_pronunciation_score: number | null;
  attempts_count: number;
  last_studied_at: string | null;
};

export type DailyActivity = {
  id: string;
  user_id: string;
  activity_date: string;
  minutes_practiced: number;
  lines_practiced: number;
  conversations_count: number;
  avg_pronunciation_score: number | null;
};

export type SavedItem = {
  id: string;
  user_id: string;
  language_id: LanguageId;
  type: SavedItemType;
  content: string;
  translation: string | null;
  note: string | null;
  source_message_id: string | null;
  source_attempt_id: string | null;
  created_at: string;
};

// Response shape từ Edge Function /chat
export type ChatApiResponse = {
  reply: string;
  translation: string;
  furigana?: string;
  romaji?: string;
  corrections: Correction[];
  hints: string[];
};

// Response shape từ Edge Function /pronounce — chấm điểm bằng Azure Pronunciation
// Assessment (clarity/fluency gộp từ accuracy+prosody, xem
// supabase/functions/_shared/azurePronunciation.ts). completeness chỉ có giá trị khi
// gọi kèm reference_text (scripted, vd Practice/Notebook); null khi score_only/unscripted
// (Live/Kid chấm theo từng câu nói tự do, không có câu mẫu để so khớp).
export type PronounceApiResponse = {
  /** false khi Azure không nhận diện được giọng nói (NoMatch, hay gặp với câu rất ngắn như
   *  "はい."). Với `score_only` (xem lib/pronunciationScoring.ts#scoreUtterance), response thật
   *  khi đó CHỈ có field này (các field còn lại không tồn tại ở runtime dù type khai required —
   *  PHẢI kiểm tra `recognized` TRƯỚC khi đọc field khác, không tự ý truy cập khi false). Với
   *  pronounce thường (scripted, Practice/Notebook), field khác vẫn luôn có giá trị thật (0 khi
   *  NoMatch) — giữ nguyên hành vi cũ, không bỏ qua. */
  recognized: boolean;
  overall_score: number;
  clarity: number;
  fluency: number;
  completeness: number | null;
  /** Azure STT recognized text — dùng để so sánh với câu mẫu (xem lib/wordDiff.ts) */
  transcript: string;
  flagged_words: FlaggedWord[];
};

// ── Live conversation (Gemini Live API) ───────────────────────────────

export type LiveTokenApiResponse = {
  token: string; // ephemeral token name (dạng "auth_tokens/xxx")
  model: string; // model để gửi trong WebSocket setup
  expire_time: string; // ISO timestamp
  voice: string; // voice name để gửi trong setup
  system_instruction: string; // system instruction để gửi trong setup
};

export type LiveTurn = {
  role: 'user' | 'assistant';
  text: string;
  sort_order: number;
};

export type FlaggedWord = {
  word: string;
  tip: string;
};

export type SessionReviewApiResponse = {
  overall_feedback: string;
  fluency_notes: string;
  corrections: Correction[];
  vocab_to_learn: string[];
  avg_pronunciation: number | null;
};
