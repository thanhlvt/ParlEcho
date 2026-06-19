-- =====================================================================
-- Kid Mode — migration idempotent áp lên DB đang chạy.
-- (schema.sql là canonical cho DB tạo mới; file này để cập nhật DB cũ.)
-- Chạy trong Supabase SQL Editor. Có thể chạy lại nhiều lần.
-- Sau khi chạy file này, chạy lại phần GRANT trong grants.sql cho
-- daily_kid_usage (hoặc câu GRANT ở cuối file này).
-- =====================================================================

-- 1. Enum 'audience' (idempotent) ------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'audience') then
    create type audience as enum ('adult', 'child');
  end if;
end $$;

-- 2. profiles: cột Kid Mode -------------------------------------------------
alter table profiles add column if not exists is_kid_mode               boolean not null default false;
alter table profiles add column if not exists parent_pin                text;
alter table profiles add column if not exists companion_id              text;
alter table profiles add column if not exists screen_time_limit_minutes int not null default 20;
alter table profiles add column if not exists child_name                text;
alter table profiles add column if not exists child_level               text default 'beginner';

-- 3. scenarios: phân loại nội dung -----------------------------------------
alter table scenarios add column if not exists audience audience not null default 'adult';

-- 4. daily_kid_usage --------------------------------------------------------
create table if not exists daily_kid_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  seconds_used  int not null default 0,
  unique (user_id, activity_date)
);
create index if not exists idx_kid_usage_user on daily_kid_usage(user_id, activity_date desc);

alter table daily_kid_usage enable row level security;
drop policy if exists "own kid_usage" on daily_kid_usage;
create policy "own kid_usage" on daily_kid_usage
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. companions (nhân vật đồng hành — nội dung tĩnh) -----------------------
create table if not exists companions (
  id           text primary key,
  name         text not null,
  personality  text not null,
  accent_color text not null default '#FF8A3D',
  sort_order   int not null default 0
);

alter table companions enable row level security;
drop policy if exists "read companions" on companions;
create policy "read companions" on companions for select to authenticated using (true);

insert into companions (id, name, personality, accent_color, sort_order) values
  ('bear',  'Gấu Mật', 'a warm, gentle, and encouraging teddy bear who loves honey and hugs; always patient and kind', '#FF9F45', 1),
  ('cat',   'Mèo Mun', 'a playful, curious, and cheerful little cat who loves games and turns learning into fun', '#7C6CF5', 2),
  ('robot', 'Robo',    'a friendly, clever little robot who is excited about learning new things and celebrates every success', '#3DC1FF', 3)
on conflict (id) do nothing;

-- 6. GRANT (Postgres không tự cấp khi tạo bảng bằng SQL Editor) -------------
grant all on table daily_kid_usage to authenticated, service_role;
grant select on table companions to anon, authenticated, service_role;

-- =====================================================================
-- Pha 2 — Guided Conversation: missions + mission_steps
-- =====================================================================

-- 7. conversation_mode: thêm value 'kid_guided' -----------------------------
alter type conversation_mode add value if not exists 'kid_guided';

-- 8. missions / mission_steps -----------------------------------------------
create table if not exists missions (
  id           uuid primary key default gen_random_uuid(),
  language_id  text not null references languages(id),
  title        text not null,
  topic        text not null,
  level        scenario_level not null default 'beginner',
  step_count   int not null,
  sticker_pool text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create table if not exists mission_steps (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references missions(id) on delete cascade,
  step_order      int not null,
  target_sentence text not null,
  intent          text not null,
  unique (mission_id, step_order)
);
create index if not exists idx_mission_steps_mission on mission_steps(mission_id, step_order);

alter table missions      enable row level security;
alter table mission_steps enable row level security;
drop policy if exists "read missions" on missions;
create policy "read missions" on missions for select to authenticated using (true);
drop policy if exists "read mission_steps" on mission_steps;
create policy "read mission_steps" on mission_steps for select to authenticated using (true);

-- 9. conversations.mission_id ------------------------------------------------
alter table conversations add column if not exists mission_id uuid references missions(id) on delete set null;

-- 10. Seed nhiệm vụ mẫu -------------------------------------------------------
do $$
declare
  v_mission_id uuid;
begin
  if not exists (select 1 from missions where title = 'Gọi món tại quán kem') then
    insert into missions (id, language_id, title, topic, level, step_count, sticker_pool)
    values (gen_random_uuid(), 'en', 'Gọi món tại quán kem', 'ordering ice cream at a shop',
            'beginner', 5, '{}')
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

-- 11. GRANT --------------------------------------------------------------
grant select on table missions to anon, authenticated, service_role;
grant select on table mission_steps to anon, authenticated, service_role;

-- =====================================================================
-- Pha 3 — Reward System: stickers/costumes + mission_results
-- =====================================================================

-- 12. stickers / costumes (nội dung tĩnh) ------------------------------------
create table if not exists stickers (
  id         text primary key,
  name       text not null,
  theme      text not null,
  emoji      text not null,
  sort_order int not null default 0
);

create table if not exists costumes (
  id           text primary key,
  companion_id text not null references companions(id) on delete cascade,
  name         text not null,
  emoji        text not null,
  sort_order   int not null default 0
);

alter table stickers enable row level security;
alter table costumes enable row level security;
drop policy if exists "read stickers" on stickers;
create policy "read stickers" on stickers for select to authenticated using (true);
drop policy if exists "read costumes" on costumes;
create policy "read costumes" on costumes for select to authenticated using (true);

-- 13. user_stickers / user_costumes / mission_results (dữ liệu user) --------
create table if not exists user_stickers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sticker_id  text not null references stickers(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, sticker_id)
);

create table if not exists user_costumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  costume_id  text not null references costumes(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, costume_id)
);

create table if not exists mission_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  mission_id      uuid not null references missions(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  stars           int not null default 0 check (stars between 0 and 3),
  used_hint       boolean not null default false,
  completed_at    timestamptz not null default now()
);
create index if not exists idx_mission_results_user on mission_results(user_id, completed_at desc);

alter table user_stickers   enable row level security;
alter table user_costumes   enable row level security;
alter table mission_results enable row level security;

drop policy if exists "own user_stickers" on user_stickers;
create policy "own user_stickers" on user_stickers
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own user_costumes" on user_costumes;
create policy "own user_costumes" on user_costumes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own mission_results" on mission_results;
create policy "own mission_results" on mission_results
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 14. Seed sticker/costume + gắn sticker_pool vào mission mẫu ---------------
insert into stickers (id, name, theme, emoji, sort_order) values
  ('sticker-scoop-chocolate',  'Kem chocolate', 'ice_cream', '🍫', 1),
  ('sticker-scoop-vanilla',    'Kem vanilla',   'ice_cream', '🍦', 2),
  ('sticker-scoop-strawberry', 'Kem dâu',       'ice_cream', '🍓', 3),
  ('sticker-cone',             'Ốc quế',        'ice_cream', '🍧', 4),
  ('sticker-cup',              'Cốc kem',       'ice_cream', '🥤', 5)
on conflict (id) do nothing;

insert into costumes (id, companion_id, name, emoji, sort_order) values
  ('costume-bear-scarf', 'bear',  'Khăn len ấm',        '🧣', 1),
  ('costume-cat-bowtie', 'cat',   'Nơ xinh',            '🎀', 1),
  ('costume-robot-cape', 'robot', 'Áo choàng anh hùng', '🦸', 1)
on conflict (id) do nothing;

update missions
set sticker_pool = array['sticker-scoop-chocolate', 'sticker-cone', 'sticker-cup']
where title = 'Gọi món tại quán kem' and sticker_pool = '{}';

-- 15. GRANT --------------------------------------------------------------
grant select on table stickers to anon, authenticated, service_role;
grant select on table costumes to anon, authenticated, service_role;
grant all on table user_stickers to authenticated, service_role;
grant all on table user_costumes to authenticated, service_role;
grant all on table mission_results to authenticated, service_role;

-- =====================================================================
-- Pha 5 — Image Exploration Mission
-- =====================================================================

-- 16. conversation_mode: thêm value 'kid_exploration' --------------------
alter type conversation_mode add value if not exists 'kid_exploration';

-- 17. exploration_images ---------------------------------------------------
create table if not exists exploration_images (
  id                uuid primary key default gen_random_uuid(),
  uploader          uuid references auth.users(id) on delete set null,
  storage_path      text not null,
  is_approved       boolean not null default false,
  safesearch_result jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_exploration_images_approved on exploration_images(is_approved);

alter table exploration_images enable row level security;
drop policy if exists "read approved exploration_images" on exploration_images;
create policy "read approved exploration_images" on exploration_images
  for select to authenticated using (is_approved = true);

-- 18. Storage bucket 'exploration-images' (idempotent) ---------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exploration-images', 'exploration-images', true, 5242880,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "exploration-images: public read" on storage.objects;
create policy "exploration-images: public read"
  on storage.objects for select to public
  using (bucket_id = 'exploration-images');

-- 19. GRANT --------------------------------------------------------------
grant select on table exploration_images to anon, authenticated;
grant all on table exploration_images to service_role;

-- =====================================================================
-- Pha 6 — Parent Dashboard
-- =====================================================================

-- 20. exploration_images: phụ huynh upload ảnh + xem trạng thái duyệt của chính mình ----
drop policy if exists "read approved exploration_images" on exploration_images;
drop policy if exists "read exploration_images" on exploration_images;
create policy "read exploration_images" on exploration_images
  for select to authenticated using (is_approved = true or uploader = auth.uid());
drop policy if exists "insert own exploration_images" on exploration_images;
create policy "insert own exploration_images" on exploration_images
  for insert to authenticated with check (uploader = auth.uid());

-- 21. priority_vocab — từ vựng/câu phụ huynh ưu tiên, đẩy lên đầu mission selection -----
create table if not exists priority_vocab (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  language_id text not null references languages(id),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_priority_vocab_user on priority_vocab(user_id, language_id);

alter table priority_vocab enable row level security;
drop policy if exists "own priority_vocab" on priority_vocab;
create policy "own priority_vocab" on priority_vocab
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 22. GRANT --------------------------------------------------------------
grant all on table priority_vocab to authenticated, service_role;
