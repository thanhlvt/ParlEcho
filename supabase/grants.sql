-- =====================================================================
-- Cấp quyền Postgres cho các role anon / authenticated
-- Chạy trong Supabase SQL Editor SAU schema.sql
--
-- Nguyên nhân: Supabase chỉ tự GRANT khi tạo bảng qua Table Editor GUI.
-- Khi tạo bằng SQL Editor (schema.sql), phải GRANT thủ công.
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

-- ── Cấp quyền dùng schema public (bắt buộc cho Postgres 15+) ─────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;
