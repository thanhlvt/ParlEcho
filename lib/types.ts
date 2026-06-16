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
export type ConversationMode = 'roleplay' | 'exam' | 'journaling' | 'code_switch' | 'free_talk';
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

export type Profile = {
  id: string;
  name: string | null;
  active_language_id: LanguageId;
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
};

export type Conversation = {
  id: string;
  user_id: string;
  scenario_id: string | null;
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

// Response shape từ Edge Function /pronounce
export type PronounceApiResponse = {
  recognized_text: string;
  overall_score: number | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  word_scores: WordScore[];
};

// ── Live conversation (Gemini Live API) ───────────────────────────────

export type LiveTokenApiResponse = {
  token: string;            // ephemeral token name (dạng "auth_tokens/xxx")
  model: string;            // model để gửi trong WebSocket setup
  expire_time: string;      // ISO timestamp
  voice: string;            // voice name để gửi trong setup
  system_instruction: string; // system instruction để gửi trong setup
};

export type LiveTurn = {
  role: 'user' | 'assistant';
  text: string;
  sort_order: number;
};

export type LiveAudioSegment = {
  message_id: string;
  audio_storage_path: string;
  text: string;
  sort_order: number;
};

export type FlaggedWord = {
  word: string;
  tip: string;
};

export type SegmentPronunciation = {
  message_id: string;
  sort_order: number;
  text: string;
  clarity: number;
  fluency: number;
  flagged_words: FlaggedWord[];
};

export type SessionReviewApiResponse = {
  overall_feedback: string;
  fluency_notes: string;
  corrections: Correction[];
  vocab_to_learn: string[];
  pronunciation: SegmentPronunciation[];
  avg_pronunciation: number | null;
};
