-- =====================================================================
-- Xoá toàn bộ lịch sử & số sao kết quả Kid Mission (mission_results) cùng
-- sticker đã thu thập (user_stickers). Không đụng tới missions/
-- mission_steps/stickers (nội dung tĩnh) hay biscuit_count.
-- Chạy trong Supabase SQL Editor hoặc:
--   npx supabase db query --linked --file supabase/reset_mission_results.sql
-- =====================================================================

truncate table mission_results;
truncate table user_stickers;
