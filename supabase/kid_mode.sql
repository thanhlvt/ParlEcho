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
alter table profiles add column if not exists screen_time_limit_minutes int not null default 20; -- giới hạn phút/phiên
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

-- 23. exploration-images: phụ huynh upload ảnh từ Parent Dashboard ------
-- Bucket chỉ có policy public read (bước 18) — thiếu policy insert nên
-- app/(kid)/parent/images.tsx upload luôn lỗi RLS. Chỉ cho phép ghi vào
-- đúng path "{auth.uid()}/..." khớp storagePath app đang dùng.
drop policy if exists "exploration-images: own upload" on storage.objects;
create policy "exploration-images: own upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exploration-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 24. exploration-images: phụ huynh xoá ảnh mình đã tải lên (parent/images.tsx) ----
drop policy if exists "exploration-images: own delete" on storage.objects;
create policy "exploration-images: own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'exploration-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete own exploration_images" on exploration_images;
create policy "delete own exploration_images" on exploration_images
  for delete to authenticated using (uploader = auth.uid());

-- 25. exploration_images: GRANT DELETE bị thiếu — RLS policy (bước 24) chỉ định nghĩa
-- AI ĐƯỢC xoá, nhưng Postgres còn cần GRANT DELETE ở cấp bảng cho role authenticated thì
-- mới cho phép câu lệnh DELETE chạy tới; thiếu GRANT này khiến xoá ảnh luôn thất bại dù
-- policy đúng (tương tự gotcha GRANT vs RLS đã gặp với storage.objects).
grant delete on table exploration_images to authenticated;

-- 26. Seed 29 nhiệm vụ bổ sung (tổng 30 cùng "Gọi món tại quán kem" đã có sẵn) -----
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

-- 27. Mở rộng catalog sticker lên 100 (đã có 5, thêm 95) -----------------
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

-- 28. Mở rộng catalog costume lên 50 (đã có 3, thêm 47: 16 bear + 16 cat + 15 robot) ----
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

-- 29. Gắn sticker_pool (3 sticker/nhiệm vụ) cho 29 nhiệm vụ mới — không có pool thì
-- không mở được sticker nào khi đạt sao (xem useMissionSession.awardMissionResult).
-- Lấy lần lượt 3 sticker chưa dùng theo sort_order cho mỗi mission, không trùng nhau.
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

-- 30. Biscuit reward (mỗi mission/exploration hoàn thành thưởng 1/3/5 bánh theo số sao) ----
alter table profiles add column if not exists biscuit_count int not null default 0;

-- 31. RPC tăng biscuit_count atomically — client (Supabase JS) không tự làm được
-- `column = column + N` an toàn dưới điều kiện race, nên dùng RPC. SECURITY INVOKER (mặc
-- định) để RLS "own profile" vẫn áp dụng — chỉ tăng được biscuit của chính mình.
create or replace function increment_biscuits(p_user_id uuid, p_amount int)
returns int
language sql
as $$
  update profiles set biscuit_count = biscuit_count + p_amount
  where id = p_user_id
  returning biscuit_count;
$$;

grant execute on function increment_biscuits(uuid, int) to authenticated;

-- 32. Costume shop: trẻ mua costume bằng biscuit (thay cho mở tự động khi đạt 3 sao) -----
alter table costumes add column if not exists price_biscuits int not null default 100;
update costumes set price_biscuits =  100 + (sort_order - 1) * 20;

-- 33. RPC mua costume bằng biscuit — atomic: trừ biscuit_count chỉ khi đủ tiền (điều kiện
-- trong WHERE của UPDATE, tránh race double-spend), rồi mới insert user_costumes.
-- SECURITY INVOKER nên vẫn theo RLS "own profile" / "own user_costumes".
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
