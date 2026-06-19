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
create type conversation_mode as enum ('roleplay', 'exam', 'journaling', 'code_switch', 'free_talk', 'kid_guided', 'kid_exploration');
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

-- Kid Mode: nhân vật đồng hành (nội dung tĩnh, dùng chung)
create table companions (
  id           text primary key,                 -- 'bear' | 'cat' | 'robot'
  name         text not null,                     -- tên hiển thị + AI tự xưng
  personality  text not null,                     -- mô tả tính cách cho system prompt (EN)
  accent_color text not null default '#FF8A3D',
  sort_order   int not null default 0
);

-- Kid Mode: nhiệm vụ hội thoại có cấu trúc (nội dung tĩnh, dùng chung)
create table missions (
  id           uuid primary key default gen_random_uuid(),
  language_id  text not null references languages(id),
  title        text not null,
  topic        text not null,                     -- mô tả ngắn cho system prompt
  level        scenario_level not null default 'beginner',
  step_count   int not null,
  sticker_pool text[] not null default '{}',       -- id sticker có thể thưởng (Pha 3)
  created_at   timestamptz not null default now()
);

create table mission_steps (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references missions(id) on delete cascade,
  step_order      int not null,
  target_sentence text not null,                  -- câu mục tiêu trẻ cần nói được
  intent          text not null,                   -- mô tả ý định cho AI nhận biết đã đạt bước
  unique (mission_id, step_order)
);
create index idx_mission_steps_mission on mission_steps(mission_id, step_order);

-- Kid Mode: catalog sticker (Pha 3 — Reward System)
create table stickers (
  id         text primary key,                    -- 'sticker-scoop-chocolate'
  name       text not null,
  theme      text not null,                        -- nhóm chủ đề (vd 'ice_cream')
  emoji      text not null,                         -- placeholder hiển thị
  sort_order int not null default 0
);

-- Kid Mode: catalog trang phục cho companion (Pha 3)
create table costumes (
  id           text primary key,                  -- 'costume-bear-scarf'
  companion_id text not null references companions(id) on delete cascade,
  name         text not null,
  emoji        text not null,                       -- huy hiệu/biểu tượng trang phục
  sort_order   int not null default 0
);

-- Kid Mode: ảnh cho Image Exploration Mission (Pha 5) — upload bởi phụ huynh (Pha 6),
-- duyệt bởi edge function image-moderation (Google Vision SafeSearch) trước khi dùng.
create table exploration_images (
  id                uuid primary key default gen_random_uuid(),
  uploader          uuid references auth.users(id) on delete set null,
  storage_path      text not null,                  -- path trong bucket 'exploration-images'
  is_approved       boolean not null default false,
  safesearch_result jsonb,
  created_at        timestamptz not null default now()
);
create index idx_exploration_images_approved on exploration_images(is_approved);

-- Kid Mode: từ vựng/câu phụ huynh ưu tiên (Pha 6 — Parent Dashboard) — đẩy mission khớp
-- title/topic/target_sentence lên đầu danh sách (app/(kid)/missions.tsx).
create table priority_vocab (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  language_id text not null references languages(id),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index idx_priority_vocab_user on priority_vocab(user_id, language_id);

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
  screen_time_limit_minutes int not null default 20,    -- giới hạn phút/phiên
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
  mission_id  uuid references missions(id) on delete set null,    -- Kid Mode: nhiệm vụ đang làm
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

-- Kid Mode: sticker/costume đã mở khoá (Pha 3 — Reward System)
create table user_stickers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sticker_id  text not null references stickers(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, sticker_id)
);

create table user_costumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  costume_id  text not null references costumes(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, costume_id)
);

-- Kid Mode: kết quả mỗi lần hoàn thành mission — chấm sao (Pha 3)
create table mission_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  mission_id      uuid not null references missions(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  stars           int not null default 0 check (stars between 0 and 3),
  used_hint       boolean not null default false,
  completed_at    timestamptz not null default now()
);
create index idx_mission_results_user on mission_results(user_id, completed_at desc);

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
alter table companions      enable row level security;
alter table missions        enable row level security;
alter table mission_steps   enable row level security;
alter table stickers        enable row level security;
alter table costumes        enable row level security;
alter table exploration_images enable row level security;

create policy "read languages"       on languages       for select to authenticated using (true);
create policy "read scenario_groups" on scenario_groups for select to authenticated using (true);
create policy "read scenarios"       on scenarios       for select to authenticated using (true);
create policy "read scenario_lines"  on scenario_lines  for select to authenticated using (true);
create policy "read companions"      on companions      for select to authenticated using (true);
create policy "read missions"        on missions        for select to authenticated using (true);
create policy "read mission_steps"   on mission_steps    for select to authenticated using (true);
-- Ảnh đã duyệt đọc được cho mọi user; phụ huynh upload (Pha 6) còn thấy ảnh của chính mình
-- khi đang chờ duyệt (is_approved=false) để theo dõi trạng thái. Duyệt do service_role.
create policy "read exploration_images" on exploration_images
  for select to authenticated using (is_approved = true or uploader = auth.uid());
create policy "insert own exploration_images" on exploration_images
  for insert to authenticated with check (uploader = auth.uid());
create policy "read stickers"        on stickers        for select to authenticated using (true);
create policy "read costumes"        on costumes        for select to authenticated using (true);
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
alter table user_stickers          enable row level security;
alter table user_costumes          enable row level security;
alter table mission_results        enable row level security;
alter table priority_vocab         enable row level security;

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

create policy "own user_stickers"  on user_stickers
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own user_costumes"  on user_costumes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own mission_results" on mission_results
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own priority_vocab" on priority_vocab
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 8. SEED tối thiểu
-- =====================================================================
insert into languages (id, name, tts_voice, stt_locale) values
  ('en', 'English',  'Kore', 'en-US'),
  ('ja', 'Japanese', 'Kore', 'ja-JP')
on conflict (id) do nothing;

insert into companions (id, name, personality, accent_color, sort_order) values
  ('bear',  'Gấu Mật', 'a warm, gentle, and encouraging teddy bear who loves honey and hugs; always patient and kind', '#FF9F45', 1),
  ('cat',   'Mèo Mun', 'a playful, curious, and cheerful little cat who loves games and turns learning into fun', '#7C6CF5', 2),
  ('robot', 'Robo',    'a friendly, clever little robot who is excited about learning new things and celebrates every success', '#3DC1FF', 3)
on conflict (id) do nothing;

-- Kid Mode: 1 nhiệm vụ mẫu — "Gọi món tại quán kem" (5 bước)
do $$
declare
  v_mission_id uuid;
begin
  if not exists (select 1 from missions where title = 'Gọi món tại quán kem') then
    insert into missions (id, language_id, title, topic, level, step_count, sticker_pool)
    values (gen_random_uuid(), 'en', 'Gọi món tại quán kem', 'ordering ice cream at a shop',
            'beginner', 5,
            array['sticker-scoop-chocolate', 'sticker-cone', 'sticker-cup'])
    returning id into v_mission_id;

    insert into mission_steps (mission_id, step_order, target_sentence, intent) values
      (v_mission_id, 1, 'Hello!', 'Trẻ chào nhân viên quán kem.'),
      (v_mission_id, 2, 'Can I have a scoop of chocolate ice cream, please?',
        'Trẻ gọi một vị kem cụ thể (vd chocolate, vanilla, strawberry).'),
      (v_mission_id, 3, 'Small, please.',
        'Trẻ chọn kích cỡ (small / medium / large).'),
      (v_mission_id, 4, 'In a cup, please.',
        'Trẻ chọn cách đựng (cup / cone).'),
      (v_mission_id, 5, 'Thank you! Goodbye!',
        'Trẻ cảm ơn và chào tạm biệt để kết thúc.');
  end if;
end $$;

-- Kid Mode: catalog sticker (chủ đề kem — khớp sticker_pool nhiệm vụ mẫu)
insert into stickers (id, name, theme, emoji, sort_order) values
  ('sticker-scoop-chocolate',  'Kem chocolate', 'ice_cream', '🍫', 1),
  ('sticker-scoop-vanilla',    'Kem vanilla',   'ice_cream', '🍦', 2),
  ('sticker-scoop-strawberry', 'Kem dâu',       'ice_cream', '🍓', 3),
  ('sticker-cone',             'Ốc quế',        'ice_cream', '🍧', 4),
  ('sticker-cup',              'Cốc kem',       'ice_cream', '🥤', 5)
on conflict (id) do nothing;

-- Kid Mode: 1 trang phục mỗi companion (mở khoá khi đạt 3 sao)
insert into costumes (id, companion_id, name, emoji, sort_order) values
  ('costume-bear-scarf', 'bear',  'Khăn len ấm',        '🧣', 1),
  ('costume-cat-bowtie', 'cat',   'Nơ xinh',            '🎀', 1),
  ('costume-robot-cape', 'robot', 'Áo choàng anh hùng', '🦸', 1)
on conflict (id) do nothing;
