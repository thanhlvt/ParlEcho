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

-- 5. GRANT (Postgres không tự cấp khi tạo bảng bằng SQL Editor) -------------
grant all on table daily_kid_usage to authenticated, service_role;
