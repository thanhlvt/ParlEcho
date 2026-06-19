-- =====================================================================
-- App luyện giao tiếp tiếng Anh & Nhật song song
-- Supabase Postgres schema + RLS + indexes + triggers
-- Chạy trong Supabase SQL Editor (hoặc đặt thành migration).
-- =====================================================================

-- Extensions ----------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- Enums ---------------------------------------------------------------
create type scenario_level   as enum ('beginner', 'intermediate', 'advanced');
create type scenario_type    as enum ('scripted', 'ai_roleplay', 'pronunciation');
create type line_speaker      as enum ('user', 'partner');
create type conversation_mode as enum ('roleplay', 'exam', 'journaling', 'code_switch', 'free_talk');
create type message_role      as enum ('user', 'assistant', 'system');
create type progress_status    as enum ('locked', 'in_progress', 'completed');
create type saved_item_type    as enum ('word', 'phrase', 'mistake');
create type audience           as enum ('adult', 'child');   -- Kid Mode: phân loại nội dung

-- =====================================================================
-- 1. NỘI DUNG TĨNH (dùng chung mọi user; không bật RLS write)
-- =====================================================================

-- Ngôn ngữ (cố định 2 dòng: en, ja)
create table languages (
  id          text primary key,                  -- 'en' | 'ja'
  name        text not null,
  tts_voice   text,                               -- vd 'en-US-JennyNeural'
  stt_locale  text not null                       -- vd 'en-US' | 'ja-JP'
);

-- Nhóm tình huống để ghép cặp EN <-> JP (1 group có 2 scenario)
create table scenario_groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- 'order-food'
  category    text not null,                      -- 'restaurant' | 'travel' ...
  created_at  timestamptz not null default now()
);

-- Tình huống cụ thể theo ngôn ngữ
create table scenarios (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references scenario_groups(id) on delete cascade,
  language_id text not null references languages(id),
  title       text not null,
  description text,
  level       scenario_level not null default 'beginner',
  type        scenario_type  not null default 'scripted',
  icon        text,
  sort_order  int not null default 0,
  audience    audience not null default 'adult',   -- 'child' = nội dung Kid Mode
  created_at  timestamptz not null default now(),
  unique (group_id, language_id)                  -- mỗi group tối đa 1 scenario / ngôn ngữ
);
create index idx_scenarios_language on scenarios(language_id);
create index idx_scenarios_group    on scenarios(group_id);

-- Câu trong kịch bản soạn sẵn
create table scenario_lines (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  language_id text not null references languages(id),
  sort_order  int not null default 0,
  speaker     line_speaker not null,
  text        text not null,
  translation text,                               -- nghĩa tiếng Việt
  furigana    text,                               -- chỉ JP
  romaji      text,                               -- chỉ JP
  phonetic    text,                               -- IPA, cho minimal pairs
  audio_url   text,                               -- TTS mẫu (Storage)
  created_at  timestamptz not null default now()
);
create index idx_lines_scenario on scenario_lines(scenario_id, sort_order);

-- =====================================================================
-- 2. NGƯỜI DÙNG  (1-1 với auth.users của Supabase)
-- =====================================================================

create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text,
  active_language_id  text references languages(id) default 'en',
  -- ── Kid Mode ─────────────────────────────────────────────────────────
  is_kid_mode               boolean not null default false,
  parent_pin                text,                       -- hash PIN 4 số (KHÔNG lưu plaintext)
  companion_id              text,                       -- nhân vật đồng hành đã chọn
  screen_time_limit_minutes int not null default 20,    -- giới hạn phút/ngày
  child_name                text,
  child_level               text default 'beginner',    -- 'beginner' | 'intermediate'
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =====================================================================
-- 3. HỘI THOẠI AI
-- =====================================================================

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid references scenarios(id) on delete set null,   -- null = free talk
  language_id text not null references languages(id),
  mode        conversation_mode not null default 'roleplay',
  summary     jsonb,                              -- {recurring_errors:[], words_to_learn:[]}
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index idx_conversations_user on conversations(user_id, started_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            message_role not null,
  sort_order      int not null default 0,
  text            text not null,
  translation     text,
  furigana        text,
  romaji          text,
  audio_url       text,
  corrections     jsonb,                          -- [{original, fixed, explanation}]
  hints           jsonb,                          -- [string]
  created_at      timestamptz not null default now()
);
create index idx_messages_conversation on messages(conversation_id, sort_order);

-- =====================================================================
-- 4. CHẤM PHÁT ÂM
-- =====================================================================

create table pronunciation_attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  language_id        text not null references languages(id),
  scenario_line_id   uuid references scenario_lines(id) on delete set null,
  message_id         uuid references messages(id) on delete set null,
  audio_url          text,
  recognized_text    text,
  overall_score      numeric(5,2),                -- 0..100
  accuracy_score     numeric(5,2),
  fluency_score      numeric(5,2),
  completeness_score numeric(5,2),
  word_scores        jsonb,                        -- [{word, score, error_type}]
  created_at         timestamptz not null default now(),
  check (scenario_line_id is not null or message_id is not null)
);
create index idx_attempts_user on pronunciation_attempts(user_id, created_at desc);
create index idx_attempts_line on pronunciation_attempts(scenario_line_id);

-- =====================================================================
-- 5. TIẾN ĐỘ & THỐNG KÊ
-- =====================================================================

create table user_progress (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  scenario_id              uuid not null references scenarios(id) on delete cascade,
  language_id              text not null references languages(id),
  status                   progress_status not null default 'in_progress',
  best_pronunciation_score numeric(5,2),
  attempts_count           int not null default 0,
  last_studied_at          timestamptz,
  unique (user_id, scenario_id)
);
create index idx_progress_user on user_progress(user_id);

create table daily_activity (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  activity_date         date not null,
  minutes_practiced     int not null default 0,
  lines_practiced       int not null default 0,
  conversations_count   int not null default 0,
  avg_pronunciation_score numeric(5,2),
  unique (user_id, activity_date)
);
create index idx_activity_user on daily_activity(user_id, activity_date desc);

-- Kid Mode: đếm thời lượng dùng app/ngày (tách khỏi daily_activity)
create table daily_kid_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  seconds_used  int not null default 0,
  unique (user_id, activity_date)
);
create index idx_kid_usage_user on daily_kid_usage(user_id, activity_date desc);

create table saved_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  language_id       text not null references languages(id),
  type              saved_item_type not null,
  content           text not null,
  translation       text,
  note              text,
  source_message_id uuid references messages(id) on delete set null,
  source_attempt_id uuid references pronunciation_attempts(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index idx_saved_user on saved_items(user_id, created_at desc);

-- =====================================================================
-- 6. TRIGGER: tự tạo profile khi có user mới + cập nhật updated_at
-- =====================================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated
  before update on profiles
  for each row execute function touch_updated_at();

-- =====================================================================
-- 7. ROW LEVEL SECURITY
--    - Bảng nội dung tĩnh: ai đăng nhập cũng đọc được, không cho ghi.
--    - Bảng dữ liệu user: chỉ chủ sở hữu đọc/ghi.
-- =====================================================================

-- 7a. Nội dung tĩnh: read-only cho mọi user đã đăng nhập
alter table languages       enable row level security;
alter table scenario_groups enable row level security;
alter table scenarios       enable row level security;
alter table scenario_lines  enable row level security;

create policy "read languages"       on languages       for select to authenticated using (true);
create policy "read scenario_groups" on scenario_groups for select to authenticated using (true);
create policy "read scenarios"       on scenarios       for select to authenticated using (true);
create policy "read scenario_lines"  on scenario_lines  for select to authenticated using (true);
-- Ghi nội dung: làm bằng service_role (bypass RLS) trong admin/seed, không cấp policy write.

-- 7b. Dữ liệu user: owner-only
alter table profiles               enable row level security;
alter table conversations          enable row level security;
alter table messages               enable row level security;
alter table pronunciation_attempts enable row level security;
alter table user_progress          enable row level security;
alter table daily_activity         enable row level security;
alter table daily_kid_usage        enable row level security;
alter table saved_items            enable row level security;

create policy "own profile"        on profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own conversations"  on conversations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own messages"       on messages
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own attempts"       on pronunciation_attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own progress"       on user_progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own activity"       on daily_activity
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own kid_usage"      on daily_kid_usage
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own saved_items"    on saved_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 8. SEED tối thiểu
-- =====================================================================
insert into languages (id, name, tts_voice, stt_locale) values
  ('en', 'English',  'Kore', 'en-US'),
  ('ja', 'Japanese', 'Kore', 'ja-JP')
on conflict (id) do nothing;
