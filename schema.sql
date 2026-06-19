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

-- Kid Mode: catalog trang phục cho companion (Pha 3) — mở qua cửa hàng dùng biscuit
-- (price_biscuits), KHÔNG còn tự mở khi đạt 3 sao (xem purchase_costume bên dưới).
create table costumes (
  id             text primary key,                -- 'costume-bear-scarf'
  companion_id   text not null references companions(id) on delete cascade,
  name           text not null,
  emoji          text not null,                     -- huy hiệu/biểu tượng trang phục
  sort_order     int not null default 0,
  price_biscuits int not null default 20            -- giá mua bằng biscuit, tăng theo sort_order
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
  biscuit_count             int not null default 0,     -- thưởng khi hoàn thành mission/exploration
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

-- Tăng biscuit_count atomically (thưởng khi hoàn thành mission/exploration, Reward System).
-- Client (Supabase JS) không tự làm được `column = column + N` an toàn dưới race, nên dùng
-- RPC. SECURITY INVOKER (mặc định) để RLS "own profile" vẫn áp dụng.
create or replace function increment_biscuits(p_user_id uuid, p_amount int)
returns int
language sql
as $$
  update profiles set biscuit_count = biscuit_count + p_amount
  where id = p_user_id
  returning biscuit_count;
$$;

grant execute on function increment_biscuits(uuid, int) to authenticated;

-- Mua costume bằng biscuit (cửa hàng trong Tủ trang phục) — atomic: trừ biscuit_count
-- chỉ khi đủ tiền (điều kiện trong WHERE của UPDATE, không phải check-rồi-update riêng lẻ,
-- để tránh race double-spend), rồi mới insert user_costumes. SECURITY INVOKER nên vẫn theo
-- RLS "own profile" / "own user_costumes".
create or replace function purchase_costume(p_user_id uuid, p_costume_id text)
returns boolean
language plpgsql
as $$
declare
  v_price int;
  v_rows int;
begin
  if exists (
    select 1 from user_costumes where user_id = p_user_id and costume_id = p_costume_id
  ) then
    return false;
  end if;

  select price_biscuits into v_price from costumes where id = p_costume_id;
  if v_price is null then
    return false;
  end if;

  update profiles set biscuit_count = biscuit_count - v_price
  where id = p_user_id and biscuit_count >= v_price;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  insert into user_costumes (user_id, costume_id) values (p_user_id, p_costume_id);
  return true;
end;
$$;

grant execute on function purchase_costume(uuid, text) to authenticated;

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

-- Kid Mode: 29 nhiệm vụ bổ sung (tổng 30 cùng "Gọi món tại quán kem" ở trên) -----
do $$
declare
  m record;
  v_mission_id uuid;
begin
  for m in (
    select * from (values
      ('Mua bánh mì tại tiệm bánh', 'buying bread at a bakery',
        'Hello!', 'Trẻ chào nhân viên tiệm bánh.',
        'Can I have a loaf of bread, please?', 'Trẻ gọi món bánh mì.',
        'Brown bread, please.', 'Trẻ chọn loại bánh (white / brown / sweet).',
        'To go, please.', 'Trẻ chọn cách lấy (to go / eat here).',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt để kết thúc.'),
      ('Mượn sách tại thư viện', 'borrowing a book at the library',
        'Hello!', 'Trẻ chào thủ thư.',
        'Can I borrow this book, please?', 'Trẻ xin mượn một quyển sách.',
        'A storybook, please.', 'Trẻ chọn loại sách (storybook / picture book / comic).',
        'For one week, please.', 'Trẻ chọn thời gian mượn (one week / two weeks).',
        'Thank you! Goodbye!', 'Trẻ cảm ơn thủ thư và chào tạm biệt.'),
      ('Khám bệnh tại phòng khám', 'visiting the doctor',
        'Hello, doctor!', 'Trẻ chào bác sĩ.',
        'My tummy hurts.', 'Trẻ nói lý do đi khám (tummy / head / throat hurts).',
        'It started yesterday.', 'Trẻ trả lời khi nào bắt đầu đau (yesterday / today / this morning).',
        'Okay, I will take the medicine.', 'Trẻ đồng ý uống thuốc theo lời bác sĩ.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn bác sĩ và chào tạm biệt.'),
      ('Mua đồ chơi tại cửa hàng', 'buying a toy at the toy store',
        'Hello!', 'Trẻ chào nhân viên cửa hàng.',
        'Can I have this toy car, please?', 'Trẻ chọn một món đồ chơi muốn mua.',
        'The red one, please.', 'Trẻ chọn màu sắc (red / blue / yellow).',
        'Can you wrap it, please?', 'Trẻ xin gói món đồ chơi lại.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Gọi taxi', 'taking a taxi',
        'Hello!', 'Trẻ chào lái xe taxi.',
        'Can you take me to the park, please?', 'Trẻ nói nơi muốn đến.',
        'Yes, I have my seatbelt on.', 'Trẻ xác nhận đã cài dây an toàn.',
        'Here is the money.', 'Trẻ trả tiền sau khi đến nơi.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Nhận phòng khách sạn', 'checking into a hotel',
        'Hello!', 'Trẻ chào nhân viên lễ tân.',
        'Can I have my room key, please?', 'Trẻ xin nhận chìa khoá phòng.',
        'Room 12, please.', 'Trẻ nói số phòng của mình.',
        'Where is the elevator, please?', 'Trẻ hỏi đường tới thang máy.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Cắt tóc tại tiệm', 'getting a haircut',
        'Hello!', 'Trẻ chào thợ cắt tóc.',
        'Can I have a haircut, please?', 'Trẻ xin cắt tóc.',
        'Short, please.', 'Trẻ chọn kiểu tóc (short / long).',
        'It looks great, thank you.', 'Trẻ khen kiểu tóc mới.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua trái cây ở siêu thị', 'buying fruit at the supermarket',
        'Hello!', 'Trẻ chào nhân viên siêu thị.',
        'Can I have some apples, please?', 'Trẻ chọn loại trái cây muốn mua.',
        'Five apples, please.', 'Trẻ nói số lượng muốn mua.',
        'In a bag, please.', 'Trẻ xin đựng trong túi.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Hỏi đường', 'asking for directions',
        'Excuse me!', 'Trẻ gọi xin chú ý lịch sự.',
        'Where is the park, please?', 'Trẻ hỏi đường tới một nơi.',
        'Is it far from here?', 'Trẻ hỏi thêm khoảng cách.',
        'Okay, turn left. Got it!', 'Trẻ xác nhận đã hiểu chỉ đường.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Gọi pizza', 'ordering a pizza',
        'Hello!', 'Trẻ chào nhân viên quán pizza.',
        'Can I have a pizza, please?', 'Trẻ gọi pizza.',
        'Cheese pizza, please.', 'Trẻ chọn loại pizza (cheese / pepperoni / vegetable).',
        'A small one, please.', 'Trẻ chọn kích cỡ (small / large).',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua kem que ở công viên', 'buying a popsicle at the park',
        'Hello!', 'Trẻ chào người bán kem que.',
        'Can I have a popsicle, please?', 'Trẻ gọi món kem que.',
        'Mango flavor, please.', 'Trẻ chọn vị (mango / orange / grape).',
        'Here is the money.', 'Trẻ trả tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Đặt bàn nhà hàng', 'booking a table at a restaurant',
        'Hello!', 'Trẻ chào nhân viên nhà hàng.',
        'A table for two, please.', 'Trẻ xin một bàn cho số người.',
        'By the window, please.', 'Trẻ chọn vị trí bàn (by the window / near the door).',
        'Can I see the menu, please?', 'Trẻ xin xem menu.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua vé xem phim', 'buying movie tickets',
        'Hello!', 'Trẻ chào nhân viên bán vé.',
        'Two tickets, please.', 'Trẻ xin số lượng vé.',
        'For the cartoon movie, please.', 'Trẻ chọn phim muốn xem.',
        'Popcorn, please.', 'Trẻ gọi thêm bắp rang.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua vé xe buýt', 'buying a bus ticket',
        'Hello!', 'Trẻ chào nhân viên bán vé xe buýt.',
        'One ticket, please.', 'Trẻ xin một vé.',
        'To the zoo, please.', 'Trẻ nói nơi muốn đến.',
        'Here is the money.', 'Trẻ trả tiền vé.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Gửi thư tại bưu điện', 'sending a letter at the post office',
        'Hello!', 'Trẻ chào nhân viên bưu điện.',
        'Can I send this letter, please?', 'Trẻ xin gửi một lá thư.',
        'A stamp, please.', 'Trẻ xin mua thêm tem.',
        'How much is it, please?', 'Trẻ hỏi giá tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mượn đồ chơi tại sân chơi', 'borrowing toys at the playground',
        'Hello!', 'Trẻ chào bạn mới ở sân chơi.',
        'Can I play with the ball, please?', 'Trẻ xin mượn một món đồ chơi.',
        'Yes, let''s play together!', 'Trẻ đề nghị chơi cùng bạn.',
        'Here you go, thank you.', 'Trẻ trả lại đồ chơi và cảm ơn.',
        'Goodbye, see you again!', 'Trẻ chào tạm biệt bạn mới.'),
      ('Đặt món ăn sáng', 'ordering breakfast',
        'Good morning!', 'Trẻ chào buổi sáng.',
        'Can I have some pancakes, please?', 'Trẻ gọi món ăn sáng.',
        'With honey, please.', 'Trẻ chọn thêm topping (honey / syrup / fruit).',
        'A glass of milk, please.', 'Trẻ gọi thêm đồ uống.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua văn phòng phẩm', 'buying school supplies',
        'Hello!', 'Trẻ chào nhân viên cửa hàng văn phòng phẩm.',
        'Can I have a notebook, please?', 'Trẻ gọi món muốn mua (notebook / pencil / eraser).',
        'The blue one, please.', 'Trẻ chọn màu sắc.',
        'How much is it, please?', 'Trẻ hỏi giá tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Hỏi giờ tàu', 'asking about train times',
        'Excuse me!', 'Trẻ xin chú ý lịch sự.',
        'What time is the next train, please?', 'Trẻ hỏi giờ tàu kế tiếp.',
        'Which platform, please?', 'Trẻ hỏi số sân ga.',
        'Thank you for your help.', 'Trẻ cảm ơn vì đã giúp đỡ.',
        'Goodbye!', 'Trẻ chào tạm biệt.'),
      ('Mua thú nhồi bông', 'buying a stuffed animal',
        'Hello!', 'Trẻ chào nhân viên cửa hàng.',
        'Can I have this teddy bear, please?', 'Trẻ chọn một con thú nhồi bông.',
        'The brown one, please.', 'Trẻ chọn màu sắc.',
        'Can you wrap it, please?', 'Trẻ xin gói lại món đồ.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Đặt bánh sinh nhật', 'ordering a birthday cake',
        'Hello!', 'Trẻ chào nhân viên tiệm bánh.',
        'Can I order a birthday cake, please?', 'Trẻ xin đặt một bánh sinh nhật.',
        'Chocolate flavor, please.', 'Trẻ chọn vị bánh.',
        'Can you write "Happy Birthday" on it?', 'Trẻ xin viết chữ lên bánh.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua nước uống tại quán', 'buying a drink at a café',
        'Hello!', 'Trẻ chào nhân viên quán nước.',
        'Can I have some orange juice, please?', 'Trẻ gọi món đồ uống.',
        'A small one, please.', 'Trẻ chọn kích cỡ.',
        'With ice, please.', 'Trẻ chọn thêm đá.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mượn sách tranh tại thư viện', 'borrowing a picture book',
        'Hello!', 'Trẻ chào thủ thư.',
        'Can I borrow a picture book, please?', 'Trẻ xin mượn sách tranh.',
        'About animals, please.', 'Trẻ chọn chủ đề sách (animals / space / dinosaurs).',
        'Thank you for helping me find it.', 'Trẻ cảm ơn thủ thư đã giúp tìm sách.',
        'Goodbye!', 'Trẻ chào tạm biệt.'),
      ('Mua vé vào sở thú', 'buying a zoo ticket',
        'Hello!', 'Trẻ chào nhân viên bán vé.',
        'One ticket, please.', 'Trẻ xin một vé vào sở thú.',
        'I want to see the lions first.', 'Trẻ nói muốn xem con vật nào trước.',
        'Here is the money.', 'Trẻ trả tiền vé.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua bóng bay', 'buying a balloon',
        'Hello!', 'Trẻ chào người bán bóng bay.',
        'Can I have a balloon, please?', 'Trẻ xin mua một quả bóng bay.',
        'The red one, please.', 'Trẻ chọn màu bóng bay.',
        'Here is the money.', 'Trẻ trả tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Đặt món tại quầy mì', 'ordering noodles',
        'Hello!', 'Trẻ chào nhân viên quầy mì.',
        'Can I have a bowl of noodles, please?', 'Trẻ gọi món mì.',
        'With chicken, please.', 'Trẻ chọn loại topping (chicken / beef / vegetable).',
        'Not spicy, please.', 'Trẻ chọn mức độ cay.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua giày mới', 'buying new shoes',
        'Hello!', 'Trẻ chào nhân viên cửa hàng giày.',
        'Can I try these shoes, please?', 'Trẻ xin thử một đôi giày.',
        'Size small, please.', 'Trẻ chọn kích cỡ (small / medium / large).',
        'They fit well, thank you.', 'Trẻ xác nhận giày vừa chân.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua mũ', 'buying a hat',
        'Hello!', 'Trẻ chào nhân viên cửa hàng.',
        'Can I have this hat, please?', 'Trẻ chọn một chiếc mũ muốn mua.',
        'The yellow one, please.', 'Trẻ chọn màu sắc.',
        'Here is the money.', 'Trẻ trả tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.'),
      ('Mua bút màu', 'buying crayons',
        'Hello!', 'Trẻ chào nhân viên cửa hàng.',
        'Can I have a box of crayons, please?', 'Trẻ gọi món bút màu.',
        'The big box, please.', 'Trẻ chọn kích cỡ hộp (big / small).',
        'Here is the money.', 'Trẻ trả tiền.',
        'Thank you! Goodbye!', 'Trẻ cảm ơn và chào tạm biệt.')
    ) as t(title, topic, s1, i1, s2, i2, s3, i3, s4, i4, s5, i5)
  )
  loop
    if not exists (select 1 from missions where title = m.title) then
      insert into missions (id, language_id, title, topic, level, step_count, sticker_pool)
      values (gen_random_uuid(), 'en', m.title, m.topic, 'beginner', 5, '{}')
      returning id into v_mission_id;

      insert into mission_steps (mission_id, step_order, target_sentence, intent) values
        (v_mission_id, 1, m.s1, m.i1),
        (v_mission_id, 2, m.s2, m.i2),
        (v_mission_id, 3, m.s3, m.i3),
        (v_mission_id, 4, m.s4, m.i4),
        (v_mission_id, 5, m.s5, m.i5);
    end if;
  end loop;
end $$;

-- Kid Mode: mở rộng catalog sticker lên 100 (đã có 5 ở trên, thêm 95) --------
insert into stickers (id, name, theme, emoji, sort_order)
select 'sticker-' || row_number() over () + 5, t.name, t.theme, t.emoji, row_number() over () + 5
from unnest(
  array[
    'Sư tử','Hổ','Voi','Hươu cao cổ','Khỉ','Gấu trúc','Cáo','Sóc','Thỏ','Mèo',
    'Chó','Heo','Bò','Ngựa','Gà','Vịt','Cú','Chim cánh cụt','Cá sấu','Rắn',
    'Rùa','Ếch','Cá','Cá heo','Cá voi','Bạch tuộc','Ốc sên','Bướm','Ong','Kiến',
    'Táo','Chuối','Dưa hấu','Dâu tây','Nho','Cam','Dứa','Xoài','Bánh mì','Bánh ngọt',
    'Kẹo','Sô-cô-la','Kem ốc quế','Pizza','Hamburger','Mì','Cơm','Sushi','Trứng','Bắp rang',
    'Ô tô','Xe buýt','Xe đạp','Tàu hoả','Máy bay','Thuyền','Tàu vũ trụ','Khí cầu','Xe cứu thương','Xe cứu hoả',
    'Xe máy','Tàu điện','Trực thăng','Taxi','Xe tải',
    'Mặt trời','Mặt trăng','Sao','Cầu vồng','Mây','Mưa','Tuyết','Sấm sét','Hoa','Cây',
    'Lá','Núi','Biển','Sa mạc','Núi lửa',
    'Người ngoài hành tinh','Rô-bốt','Đũa phép','Kỳ lân','Rồng','Vương miện','Lâu đài','Sao băng','Hành tinh','Trái đất',
    'Cầu pha lê','Chiếc nhẫn','Chuông','Hộp quà','Bóng bay'
  ],
  array[
    'animal','animal','animal','animal','animal','animal','animal','animal','animal','animal',
    'animal','animal','animal','animal','animal','animal','animal','animal','animal','animal',
    'animal','animal','animal','animal','animal','animal','animal','animal','animal','animal',
    'food','food','food','food','food','food','food','food','food','food',
    'food','food','food','food','food','food','food','food','food','food',
    'vehicle','vehicle','vehicle','vehicle','vehicle','vehicle','vehicle','vehicle','vehicle','vehicle',
    'vehicle','vehicle','vehicle','vehicle','vehicle',
    'nature','nature','nature','nature','nature','nature','nature','nature','nature','nature',
    'nature','nature','nature','nature','nature',
    'fantasy','fantasy','fantasy','fantasy','fantasy','fantasy','fantasy','fantasy','fantasy','fantasy',
    'fantasy','fantasy','fantasy','fantasy','fantasy'
  ],
  array[
    '🦁','🐯','🐘','🦒','🐵','🐼','🦊','🐿️','🐰','🐱',
    '🐶','🐷','🐮','🐴','🐔','🦆','🦉','🐧','🐊','🐍',
    '🐢','🐸','🐟','🐬','🐳','🐙','🐌','🦋','🐝','🐜',
    '🍎','🍌','🍉','🍓','🍇','🍊','🍍','🥭','🍞','🍰',
    '🍬','🍫','🍦','🍕','🍔','🍜','🍚','🍣','🥚','🍿',
    '🚗','🚌','🚲','🚂','✈️','⛵','🚀','🎈','🚑','🚒',
    '🏍️','🚊','🚁','🚕','🚚',
    '☀️','🌙','⭐','🌈','☁️','🌧️','❄️','⚡','🌸','🌳',
    '🍃','⛰️','🌊','🏜️','🌋',
    '👽','🤖','🪄','🦄','🐉','👑','🏰','🌠','🪐','🌍',
    '🔮','💍','🔔','🎁','🎈'
  ]
) as t(name, theme, emoji)
on conflict (id) do nothing;

-- Kid Mode: mở rộng catalog costume lên 50 (đã có 3 ở trên, thêm 47) ---------
insert into costumes (id, companion_id, name, emoji, sort_order)
select 'costume-bear-' || (idx + 1), 'bear', name, emoji, (idx + 1)
from (
  select row_number() over () as idx, name, emoji from unnest(
    array['Nón vui nhộn','Kính râm','Vương miện','Balo phiêu lưu','Dù che nắng','Giày boots',
          'Bao tay ấm','Vòng cổ lấp lánh','Huy chương','Cánh thiên thần','Mặt nạ bí ẩn',
          'Áo choàng phù thủy','Nón cướp biển','Vòng hoa','Nơ lấp lánh','Đôi cánh bướm'],
    array['🎩','🕶️','👑','🎒','☂️','👢','🧤','📿','🏅','🪽','🎭','🧙','🏴‍☠️','🌼','🎗️','🦋']
  ) as t(name, emoji)
) s
on conflict (id) do nothing;

insert into costumes (id, companion_id, name, emoji, sort_order)
select 'costume-cat-' || (idx + 1), 'cat', name, emoji, (idx + 1)
from (
  select row_number() over () as idx, name, emoji from unnest(
    array['Nón vui nhộn','Kính râm','Vương miện','Balo phiêu lưu','Dù che nắng','Giày boots',
          'Bao tay ấm','Vòng cổ lấp lánh','Huy chương','Cánh thiên thần','Mặt nạ bí ẩn',
          'Áo choàng phù thủy','Nón cướp biển','Vòng hoa','Nơ lấp lánh','Đôi cánh bướm'],
    array['🎩','🕶️','👑','🎒','☂️','👢','🧤','📿','🏅','🪽','🎭','🧙','🏴‍☠️','🌼','🎗️','🦋']
  ) as t(name, emoji)
) s
on conflict (id) do nothing;

insert into costumes (id, companion_id, name, emoji, sort_order)
select 'costume-robot-' || (idx + 1), 'robot', name, emoji, (idx + 1)
from (
  select row_number() over () as idx, name, emoji from unnest(
    array['Nón vui nhộn','Kính râm','Vương miện','Balo phiêu lưu','Dù che nắng','Giày boots',
          'Bao tay ấm','Vòng cổ lấp lánh','Huy chương','Cánh thiên thần','Mặt nạ bí ẩn',
          'Áo choàng phù thủy','Nón cướp biển','Vòng hoa','Nơ lấp lánh'],
    array['🎩','🕶️','👑','🎒','☂️','👢','🧤','📿','🏅','🪽','🎭','🧙','🏴‍☠️','🌼','🎗️']
  ) as t(name, emoji)
) s
on conflict (id) do nothing;

-- Kid Mode: giá costume tăng dần theo sort_order (100, 120, 140... biscuit) để trẻ dành dụm dần.
update costumes set price_biscuits = 100 + (sort_order - 1) * 20;

-- Kid Mode: gắn sticker_pool (3 sticker/nhiệm vụ) cho 29 nhiệm vụ mới — không có pool thì
-- không mở được sticker nào khi đạt sao (xem useMissionSession.awardMissionResult).
do $$
declare
  mis record;
  i int := 0;
  pool text[];
begin
  for mis in (
    select id from missions where title <> 'Gọi món tại quán kem' and sticker_pool = '{}'
    order by created_at
  ) loop
    select array_agg(id) into pool from (
      select id from stickers where id ~ '^sticker-[0-9]+$'
      order by sort_order offset (i * 3) limit 3
    ) s;
    update missions set sticker_pool = pool where id = mis.id;
    i := i + 1;
  end loop;
end $$;
