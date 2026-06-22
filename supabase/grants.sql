-- =====================================================================
-- Cấp quyền Postgres cho các role anon / authenticated / service_role
-- Chạy trong Supabase SQL Editor SAU schema.sql
--
-- Nguyên nhân: Supabase chỉ tự GRANT khi tạo bảng qua Table Editor GUI.
-- Khi tạo bằng SQL Editor (schema.sql), phải GRANT thủ công.
-- service_role cần ALL để Edge Functions có thể read/write (bypass RLS
-- nhưng vẫn cần table-level permission).
-- =====================================================================

-- ── Nội dung tĩnh: đọc được cho cả anon + authenticated ──────────────
GRANT SELECT ON TABLE languages       TO anon, authenticated;
GRANT SELECT ON TABLE scenario_groups TO anon, authenticated;
GRANT SELECT ON TABLE scenarios       TO anon, authenticated;
GRANT SELECT ON TABLE scenario_lines  TO anon, authenticated;
GRANT SELECT ON TABLE companions      TO anon, authenticated;
GRANT SELECT ON TABLE missions        TO anon, authenticated;
GRANT SELECT ON TABLE mission_steps   TO anon, authenticated;
GRANT SELECT ON TABLE stickers        TO anon, authenticated;
GRANT SELECT ON TABLE costumes        TO anon, authenticated;
GRANT SELECT ON TABLE exploration_images TO anon, authenticated;
GRANT INSERT ON TABLE exploration_images TO authenticated;

-- ── Dữ liệu người dùng: chỉ authenticated ────────────────────────────
GRANT ALL ON TABLE profiles               TO authenticated;
GRANT ALL ON TABLE conversations          TO authenticated;
GRANT ALL ON TABLE messages               TO authenticated;
GRANT ALL ON TABLE pronunciation_attempts TO authenticated;
GRANT ALL ON TABLE user_progress          TO authenticated;
GRANT ALL ON TABLE daily_activity         TO authenticated;
GRANT ALL ON TABLE daily_kid_usage        TO authenticated;
GRANT ALL ON TABLE saved_items            TO authenticated;
GRANT ALL ON TABLE user_stickers          TO authenticated;
GRANT ALL ON TABLE user_costumes          TO authenticated;
GRANT ALL ON TABLE companion_costume_state TO authenticated;
GRANT ALL ON TABLE mission_results        TO authenticated;
GRANT ALL ON TABLE exploration_results    TO authenticated;
GRANT ALL ON TABLE priority_vocab         TO authenticated;

-- ── service_role: dùng trong Edge Functions (bypasses RLS nhưng vẫn
--    cần table permission) ─────────────────────────────────────────────
GRANT ALL ON TABLE profiles               TO service_role;
GRANT ALL ON TABLE conversations          TO service_role;
GRANT ALL ON TABLE messages               TO service_role;
GRANT ALL ON TABLE pronunciation_attempts TO service_role;
GRANT ALL ON TABLE user_progress          TO service_role;
GRANT ALL ON TABLE daily_activity         TO service_role;
GRANT ALL ON TABLE daily_kid_usage        TO service_role;
GRANT ALL ON TABLE saved_items            TO service_role;
GRANT ALL ON TABLE user_stickers          TO service_role;
GRANT ALL ON TABLE user_costumes          TO service_role;
GRANT ALL ON TABLE companion_costume_state TO service_role;
GRANT ALL ON TABLE mission_results        TO service_role;
GRANT ALL ON TABLE exploration_results    TO service_role;
GRANT ALL ON TABLE priority_vocab         TO service_role;
GRANT SELECT ON TABLE languages           TO service_role;
GRANT SELECT ON TABLE scenario_groups     TO service_role;
GRANT SELECT ON TABLE scenarios           TO service_role;
GRANT SELECT ON TABLE companions          TO service_role;
GRANT SELECT ON TABLE missions            TO service_role;
GRANT SELECT ON TABLE mission_steps       TO service_role;
GRANT SELECT ON TABLE stickers            TO service_role;
GRANT SELECT ON TABLE costumes            TO service_role;
-- UPDATE needed so generate-audio script and TTS function can write audio_url back
GRANT SELECT, UPDATE ON TABLE scenario_lines TO service_role;
-- ALL needed so image-moderation function can insert/update is_approved + safesearch_result
GRANT ALL ON TABLE exploration_images TO service_role;

-- ── Cấp quyền dùng schema public (bắt buộc cho Postgres 15+) ─────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
