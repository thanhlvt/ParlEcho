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

-- ── Dữ liệu người dùng: chỉ authenticated ────────────────────────────
GRANT ALL ON TABLE profiles               TO authenticated;
GRANT ALL ON TABLE conversations          TO authenticated;
GRANT ALL ON TABLE messages               TO authenticated;
GRANT ALL ON TABLE pronunciation_attempts TO authenticated;
GRANT ALL ON TABLE user_progress          TO authenticated;
GRANT ALL ON TABLE daily_activity         TO authenticated;
GRANT ALL ON TABLE saved_items            TO authenticated;

-- ── service_role: dùng trong Edge Functions (bypasses RLS nhưng vẫn
--    cần table permission) ─────────────────────────────────────────────
GRANT ALL ON TABLE profiles               TO service_role;
GRANT ALL ON TABLE conversations          TO service_role;
GRANT ALL ON TABLE messages               TO service_role;
GRANT ALL ON TABLE pronunciation_attempts TO service_role;
GRANT ALL ON TABLE user_progress          TO service_role;
GRANT ALL ON TABLE daily_activity         TO service_role;
GRANT ALL ON TABLE saved_items            TO service_role;
GRANT SELECT ON TABLE languages           TO service_role;
GRANT SELECT ON TABLE scenario_groups     TO service_role;
GRANT SELECT ON TABLE scenarios           TO service_role;
-- UPDATE needed so generate-audio script and TTS function can write audio_url back
GRANT SELECT, UPDATE ON TABLE scenario_lines TO service_role;

-- ── Cấp quyền dùng schema public (bắt buộc cho Postgres 15+) ─────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
