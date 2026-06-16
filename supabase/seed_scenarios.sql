-- =====================================================================
-- Seed dữ liệu mẫu: 2 nhóm kịch bản × 2 ngôn ngữ (EN + JP)
-- Chạy SAU schema.sql trong Supabase SQL Editor
-- =====================================================================

-- -----------------------------------------------------------------------
-- Nhóm 1: Gọi món tại nhà hàng
-- -----------------------------------------------------------------------
INSERT INTO scenario_groups (id, slug, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'order-food', 'restaurant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenarios (id, group_id, language_id, title, description, level, type, icon, sort_order) VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'en', 'Ordering Food',
    'Practice ordering food at a restaurant in English',
    'beginner', 'scripted', '🍽️', 1
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'ja', '食べ物を注文する',
    'レストランで食べ物を注文する練習',
    'beginner', 'scripted', '🍽️', 1
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenario_lines (scenario_id, language_id, sort_order, speaker, text, translation) VALUES
  ('00000000-0000-0000-0001-000000000001', 'en', 1, 'partner',
    'Good evening! Welcome to our restaurant. Do you have a reservation?',
    'Chào buổi tối! Chào mừng đến nhà hàng. Bạn có đặt bàn trước không?'),
  ('00000000-0000-0000-0001-000000000001', 'en', 2, 'user',
    'No, I don''t. Do you have a table for two?',
    'Không. Bạn có bàn cho hai người không?'),
  ('00000000-0000-0000-0001-000000000001', 'en', 3, 'partner',
    'Of course! Right this way, please. Here''s your menu.',
    'Tất nhiên! Mời đi theo tôi. Đây là thực đơn.'),
  ('00000000-0000-0000-0001-000000000001', 'en', 4, 'user',
    'Thank you. I''d like to order the grilled salmon, please.',
    'Cảm ơn. Tôi muốn gọi món cá hồi nướng.'),
  ('00000000-0000-0000-0001-000000000001', 'en', 5, 'partner',
    'Excellent choice! Would you like anything to drink?',
    'Lựa chọn tuyệt vời! Bạn muốn uống gì không?'),
  ('00000000-0000-0000-0001-000000000001', 'en', 6, 'user',
    'Yes, I''ll have a glass of water and an orange juice, please.',
    'Vâng, cho tôi một ly nước và một ly nước cam.');

INSERT INTO scenario_lines (scenario_id, language_id, sort_order, speaker, text, translation, furigana, romaji) VALUES
  ('00000000-0000-0000-0001-000000000002', 'ja', 1, 'partner',
    'いらっしゃいませ。何名様ですか？',
    'Xin chào. Có bao nhiêu người ạ?',
    'いらっしゃいませ。なんめいさまですか？',
    'Irasshaimase. Nan-mei-sama desu ka?'),
  ('00000000-0000-0000-0001-000000000002', 'ja', 2, 'user',
    '二人です。',
    'Hai người ạ.',
    'ふたりです。',
    'Futari desu.'),
  ('00000000-0000-0000-0001-000000000002', 'ja', 3, 'partner',
    'かしこまりました。こちらへどうぞ。',
    'Vâng, mời đi theo tôi.',
    'かしこまりました。こちらへどうぞ。',
    'Kashikomarimashita. Kochira e dōzo.'),
  ('00000000-0000-0000-0001-000000000002', 'ja', 4, 'user',
    'すみません、注文してもいいですか？',
    'Xin lỗi, tôi có thể gọi món được không?',
    'すみません、ちゅうもんしてもいいですか？',
    'Sumimasen, chūmon shite mo ii desu ka?'),
  ('00000000-0000-0000-0001-000000000002', 'ja', 5, 'partner',
    'はい、ご注文はお決まりですか？',
    'Vâng, bạn đã quyết định gọi gì chưa?',
    'はい、ごちゅうもんはおきまりですか？',
    'Hai, go-chūmon wa o-kimari desu ka?'),
  ('00000000-0000-0000-0001-000000000002', 'ja', 6, 'user',
    'ラーメンを一つと、餃子を二つください。',
    'Cho tôi một tô ramen và hai cái gyoza.',
    'ラーメンをひとつと、ぎょうざをふたつください。',
    'Rāmen wo hitotsu to, gyōza wo futatsu kudasai.');

-- -----------------------------------------------------------------------
-- Nhóm 2: Check-in khách sạn
-- -----------------------------------------------------------------------
INSERT INTO scenario_groups (id, slug, category) VALUES
  ('00000000-0000-0000-0000-000000000002', 'hotel-checkin', 'travel')
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenarios (id, group_id, language_id, title, description, level, type, icon, sort_order) VALUES
  (
    '00000000-0000-0000-0002-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'en', 'Hotel Check-in',
    'Practice checking in at a hotel in English',
    'beginner', 'scripted', '🏨', 2
  ),
  (
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'ja', 'ホテルのチェックイン',
    'ホテルのチェックインを練習する',
    'beginner', 'scripted', '🏨', 2
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenario_lines (scenario_id, language_id, sort_order, speaker, text, translation) VALUES
  ('00000000-0000-0000-0002-000000000001', 'en', 1, 'partner',
    'Good afternoon! Welcome to Grand Hotel. How can I help you?',
    'Xin chào buổi chiều! Chào mừng đến Grand Hotel.'),
  ('00000000-0000-0000-0002-000000000001', 'en', 2, 'user',
    'Hi, I have a reservation under the name Nguyen.',
    'Xin chào, tôi có đặt phòng với tên Nguyễn.'),
  ('00000000-0000-0000-0002-000000000001', 'en', 3, 'partner',
    'Let me check that for you. Yes, I have a double room for two nights. Is that correct?',
    'Để tôi kiểm tra. Đúng, phòng đôi hai đêm, đúng không?'),
  ('00000000-0000-0000-0002-000000000001', 'en', 4, 'user',
    'Yes, that''s right. Could I have a room with a view?',
    'Đúng vậy. Tôi có thể có phòng nhìn ra ngoài không?'),
  ('00000000-0000-0000-0002-000000000001', 'en', 5, 'partner',
    'Certainly! I''ll give you room 802 on the 8th floor with a city view.',
    'Tất nhiên! Phòng 802 tầng 8 nhìn ra thành phố.'),
  ('00000000-0000-0000-0002-000000000001', 'en', 6, 'user',
    'Perfect, thank you! What time is breakfast?',
    'Tuyệt vời, cảm ơn! Bữa sáng lúc mấy giờ?');

INSERT INTO scenario_lines (scenario_id, language_id, sort_order, speaker, text, translation, furigana, romaji) VALUES
  ('00000000-0000-0000-0002-000000000002', 'ja', 1, 'partner',
    'いらっしゃいませ。チェックインですか？',
    'Xin chào. Bạn đến check-in ạ?',
    'いらっしゃいませ。チェックインですか？',
    'Irasshaimase. Chekku-in desu ka?'),
  ('00000000-0000-0000-0002-000000000002', 'ja', 2, 'user',
    'はい、予約しています。グエンです。',
    'Vâng, tôi có đặt phòng. Tên tôi là Nguyễn.',
    'はい、よやくしています。グエンです。',
    'Hai, yoyaku shite imasu. Guen desu.'),
  ('00000000-0000-0000-0002-000000000002', 'ja', 3, 'partner',
    '少々お待ちください。はい、シングルルーム一泊ですね。',
    'Xin chờ một chút. Phòng đơn một đêm đúng không?',
    'しょうしょうおまちください。はい、シングルルームいっぱくですね。',
    'Shōshō o-machi kudasai. Hai, shinguru-rūmu ippaku desu ne.'),
  ('00000000-0000-0000-0002-000000000002', 'ja', 4, 'user',
    'そうです。部屋はどこですか？',
    'Đúng vậy. Phòng ở đâu ạ?',
    'そうです。へやはどこですか？',
    'Sō desu. Heya wa doko desu ka?'),
  ('00000000-0000-0000-0002-000000000002', 'ja', 5, 'partner',
    '五階の五〇二号室です。こちらがカードキーです。',
    'Phòng 502 tầng 5. Đây là thẻ từ của bạn.',
    'ごかいのごぜろにごうしつです。こちらがカードキーです。',
    'Go-kai no go-zero-ni-gō-shitsu desu. Kochira ga kādo-kī desu.'),
  ('00000000-0000-0000-0002-000000000002', 'ja', 6, 'user',
    'ありがとうございます。朝食は何時からですか？',
    'Cảm ơn bạn. Bữa sáng từ mấy giờ?',
    'ありがとうございます。ちょうしょくはなんじからですか？',
    'Arigatō gozaimasu. Chōshoku wa nan-ji kara desu ka?');
