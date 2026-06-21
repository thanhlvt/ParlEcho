const fs = require('fs');
const path = require('path');

function escapeSql(str) {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

const mdPath = path.join(__dirname, 'missions.md');
const sqlPath = path.join(__dirname, 'add_missions_66.sql');

const content = fs.readFileSync(mdPath, 'utf-8');
const blocks = content.split('### Chủ đề').slice(1);

const customStickers = [
  // 1: Nhận nuôi thú cưng
  [
    { name: 'Mèo tinh nghịch', emoji: '🐱' },
    { name: 'Cún Golden', emoji: '🦮' },
    { name: 'Poodle đáng yêu', emoji: '🐩' }
  ],
  // 2: Làm món sa-lát trái cây
  [
    { name: 'Dâu tây đỏ', emoji: '🍓' },
    { name: 'Chuối chín vàng', emoji: '🍌' },
    { name: 'Bát salad tươi', emoji: '🥗' }
  ],
  // 3: Kể về siêu anh hùng
  [
    { name: 'Áo choàng đỏ', emoji: '🦸' },
    { name: 'Khiên công lý', emoji: '🛡' },
    { name: 'Tia chớp vàng', emoji: '⚡' }
  ],
  // 4: Dọn dẹp phòng ngủ
  [
    { name: 'Chiếc chổi nhỏ', emoji: '🧹' },
    { name: 'Hộp đồ chơi', emoji: '📦' },
    { name: 'Giường ngăn nắp', emoji: '🛏' }
  ],
  // 5: Chuẩn bị đi học ngày mưa
  [
    { name: 'Đám mây mưa', emoji: '🌧' },
    { name: 'Áo mưa vàng', emoji: '🧥' },
    { name: 'Chiếc ô nhỏ', emoji: '🌂' }
  ],
  // 6: Chơi xích đu ở sân chơi
  [
    { name: 'Xích đu nhỏ', emoji: '🎠' },
    { name: 'Diều bay cao', emoji: '🪁' },
    { name: 'Quả bóng bay', emoji: '🎈' }
  ],
  // 7: Xin phép xem TV
  [
    { name: 'Tivi màn hình', emoji: '📺' },
    { name: 'Bắp rang bơ', emoji: '🍿' },
    { name: 'Tay cầm game', emoji: '🕹' }
  ],
  // 8: Đi bơi ở hồ bơi
  [
    { name: 'Kính bơi xanh', emoji: '🏊' },
    { name: 'Phao cứu hộ', emoji: '🛟' },
    { name: 'Đồ bơi nhỏ', emoji: '🩱' }
  ],
  // 9: Nhờ giúp làm bài tập thủ công
  [
    { name: 'Kéo thủ công', emoji: '✂' },
    { name: 'Lọ hồ dán', emoji: '🧪' },
    { name: 'Máy bay giấy', emoji: '✈' }
  ],
  // 10: Mua kem đánh răng
  [
    { name: 'Bàn chải xinh', emoji: '🪥' },
    { name: 'Kem vị dâu', emoji: '🧴' },
    { name: 'Xe siêu thị', emoji: '🛒' }
  ],
  // 11: Mượn gọt bút chì
  [
    { name: 'Bút chì màu', emoji: '✏' },
    { name: 'Gọt chì đỏ', emoji: '🪒' },
    { name: 'Khay màu vẽ', emoji: '🎨' }
  ],
  // 12: Khoe điểm tốt
  [
    { name: 'Điểm mười tròn', emoji: '💯' },
    { name: 'Bài thi A+', emoji: '📝' },
    { name: 'Ngôi sao đỏ', emoji: '🌟' }
  ],
  // 13: Trồng cây trong vườn
  [
    { name: 'Mầm cây non', emoji: '🌱' },
    { name: 'Xẻng nhỏ vườn', emoji: '🧑‍🌾' },
    { name: 'Bình tưới cây', emoji: '🚿' }
  ],
  // 14: Đi khám răng
  [
    { name: 'Răng khỏe mạnh', emoji: '🦷' },
    { name: 'Bàn chải sạch', emoji: '🪥' },
    { name: 'Quả táo ngọt', emoji: '🍎' }
  ],
  // 15: Gọi điện thoại cho ông bà
  [
    { name: 'Điện thoại bàn', emoji: '☎' },
    { name: 'Bà ngoại hiền', emoji: '👵' },
    { name: 'Ông ngoại hiền', emoji: '👴' }
  ],
  // 16: Đi dã ngoại ở công viên
  [
    { name: 'Giỏ dã ngoại', emoji: '🧺' },
    { name: 'Bánh sandwich ngon', emoji: '🥪' },
    { name: 'Cây rợp bóng', emoji: '🌳' }
  ],
  // 17: Thăm ông bà ở nông trại
  [
    { name: 'Máy kéo đỏ', emoji: '🚜' },
    { name: 'Gà con vàng', emoji: '🐥' },
    { name: 'Nhánh lúa chín', emoji: '🌾' }
  ],
  // 18: Đi cắm trại trong rừng
  [
    { name: 'Lều ấm cúng', emoji: '⛺' },
    { name: 'Đống củi khô', emoji: '🪵' },
    { name: 'Kẹo dẻo nướng', emoji: '🍢' }
  ],
  // 19: Chơi trốn tìm
  [
    { name: 'Chú khỉ trốn', emoji: '🙈' },
    { name: 'Cánh cửa gỗ', emoji: '🚪' },
    { name: 'Kính lúp tìm', emoji: '🕵' }
  ],
  // 20: Giúp mẹ dọn dẹp đồ chơi
  [
    { name: 'Gấu bông nhỏ', emoji: '🧸' },
    { name: 'Mảnh ghép lego', emoji: '🧩' },
    { name: 'Rổ đồ chơi', emoji: '🧺' }
  ],
  // 21: Tập đi xe đạp
  [
    { name: 'Xe đạp nhỏ', emoji: '🚲' },
    { name: 'Mũ bảo hiểm', emoji: '🪖' },
    { name: 'Vạch đích đỏ', emoji: '🏁' }
  ],
  // 22: Giúp người già qua đường
  [
    { name: 'Bà cụ hiền', emoji: '👵' },
    { name: 'Đèn giao thông', emoji: '🚦' },
    { name: 'Biển báo hiệu', emoji: '🚸' }
  ],
  // 23: Nhờ mẹ dạy làm bánh sandwich
  [
    { name: 'Bánh mì gối', emoji: '🍞' },
    { name: 'Phô mai béo', emoji: '🧀' },
    { name: 'Thịt nguội ngon', emoji: '🥓' }
  ],
  // 24: Kể về một giấc mơ
  [
    { name: 'Đám mây mơ', emoji: '😴' },
    { name: 'Voi hồng bay', emoji: '🐘' },
    { name: 'Ly kem lớn', emoji: '🍦' }
  ],
  // 25: Nhờ bạn dạy chơi cờ
  [
    { name: 'Quân tốt gỗ', emoji: '♟' },
    { name: 'Quân mã đẹp', emoji: '🐴' },
    { name: 'Vương miện vàng', emoji: '👑' }
  ],
  // 26: Xin lỗi mẹ vì làm vỡ đồ
  [
    { name: 'Chiếc cốc vỡ', emoji: '🥛' },
    { name: 'Chổi dọn dẹp', emoji: '🧹' },
    { name: 'Mặt hối lỗi', emoji: '🥺' }
  ],
  // 27: Hỏi thăm giờ giấc
  [
    { name: 'Đồng hồ tay', emoji: '⌚' },
    { name: 'Đồng hồ bàn', emoji: '⏰' },
    { name: 'Xe buýt học', emoji: '🚌' }
  ],
  // 28: Khen ngợi bức tranh của bạn
  [
    { name: 'Bảng pha màu', emoji: '🎨' },
    { name: 'Khủng long con', emoji: '🦕' },
    { name: 'Khung tranh nhỏ', emoji: '🖼' }
  ],
  // 29: Xin chơi chung thể thao
  [
    { name: 'Quả bóng tròn', emoji: '⚽' },
    { name: 'Khung thành rộng', emoji: '🥅' },
    { name: 'Cúp vàng nhỏ', emoji: '🏆' }
  ],
  // 30: Mời bạn đến nhà chơi
  [
    { name: 'Ngôi nhà nhỏ', emoji: '🏠' },
    { name: 'Bánh quy ngon', emoji: '🍪' },
    { name: 'Hộp đồ chơi', emoji: '🧩' }
  ],
  // 31: Thả diều trên cánh đồng
  [
    { name: 'Diều giấy màu', emoji: '🪁' },
    { name: 'Cơn gió mát', emoji: '💨' },
    { name: 'Cánh đồng cỏ', emoji: '🌾' }
  ],
  // 32: Xây lâu đài cát trên bãi biển
  [
    { name: 'Lâu đài cát', emoji: '🏖' },
    { name: 'Xô nhựa nhỏ', emoji: '🪣' },
    { name: 'Vỏ sò nhỏ', emoji: '🐚' }
  ],
  // 33: Thăm bảo tàng khủng long
  [
    { name: 'Khủng long bạo', emoji: '🦖' },
    { name: 'Bộ xương cổ', emoji: '🦴' },
    { name: 'Máy ảnh nhỏ', emoji: '📷' }
  ],
  // 34: Nhận bưu kiện từ người giao hàng
  [
    { name: 'Hộp bưu kiện', emoji: '📦' },
    { name: 'Xe giao hàng', emoji: '🚚' },
    { name: 'Phiếu ký nhận', emoji: '📋' }
  ],
  // 35: Làm thiệp tặng mẹ
  [
    { name: 'Tấm thiệp xinh', emoji: '💌' },
    { name: 'Trái tim đỏ', emoji: '💖' },
    { name: 'Bút sáp hồng', emoji: '🖍' }
  ],
  // 36: Ngắm sao bằng kính viễn vọng
  [
    { name: 'Kính viễn vọng', emoji: '🔭' },
    { name: 'Trăng khuyết sáng', emoji: '🌙' },
    { name: 'Ngôi sao đêm', emoji: '🌟' }
  ],
  // 37: Làm người tuyết
  [
    { name: 'Người tuyết nhỏ', emoji: '⛄' },
    { name: 'Củ cà rốt', emoji: '🥕' },
    { name: 'Khăn len đỏ', emoji: '🧣' }
  ],
  // 38: Đi tàu lượn siêu tốc
  [
    { name: 'Đường tàu lượn', emoji: '🎢' },
    { name: 'Vé công viên', emoji: '🎫' },
    { name: 'Mặt ngạc nhiên', emoji: '🙀' }
  ],
  // 39: Gói quà sinh nhật
  [
    { name: 'Hộp quà xinh', emoji: '🎁' },
    { name: 'Chiếc nơ xinh', emoji: '🎀' },
    { name: 'Băng keo nhỏ', emoji: '✂' }
  ],
  // 40: Thu hoạch táo ở trang trại
  [
    { name: 'Quả táo đỏ', emoji: '🍎' },
    { name: 'Giỏ hái táo', emoji: '🧺' },
    { name: 'Bánh táo nướng', emoji: '🥧' }
  ],
  // 41: Trang trí cây thông Noel
  [
    { name: 'Cây thông nhỏ', emoji: '🎄' },
    { name: 'Ngôi sao vàng', emoji: '🌟' },
    { name: 'Quả chuông nhỏ', emoji: '🔔' }
  ],
  // 42: Mua hoa tặng cô giáo
  [
    { name: 'Hoa hướng dương', emoji: '🌻' },
    { name: 'Bó hoa hồng', emoji: '💐' },
    { name: 'Nơ thắt xinh', emoji: '🎀' }
  ],
  // 43: Tham gia lớp học võ
  [
    { name: 'Võ phục trắng', emoji: '🥋' },
    { name: 'Nắm đấm nhỏ', emoji: '🤜' },
    { name: 'Tấm gỗ tập', emoji: '🪵' }
  ],
  // 44: Tham quan thủy cung
  [
    { name: 'Cá hề xinh', emoji: '🐠' },
    { name: 'Cá mập to', emoji: '🦈' },
    { name: 'Rùa biển nhỏ', emoji: '🐢' }
  ],
  // 45: Đi xem xiếc
  [
    { name: 'Rạp xiếc lớn', emoji: '🎪' },
    { name: 'Chú hề vui', emoji: '🤡' },
    { name: 'Sư tử xiếc', emoji: '🦁' }
  ],
  // 46: Rửa xe ô tô cùng bố
  [
    { name: 'Xe hơi sạch', emoji: '🚗' },
    { name: 'Bọt biển mềm', emoji: '🧽' },
    { name: 'Bọt xà phòng', emoji: '🫧' }
  ],
  // 47: Học làm bánh quy
  [
    { name: 'Bánh quy bơ', emoji: '🍪' },
    { name: 'Trục cán bột', emoji: '🥖' },
    { name: 'Ly sữa ấm', emoji: '🥛' }
  ],
  // 48: Tham gia tiệc hóa trang
  [
    { name: 'Con ma nhỏ', emoji: '👻' },
    { name: 'Mũ hải tặc', emoji: '🏴‍☠️' },
    { name: 'Kẹo ngọt nhỏ', emoji: '🍬' }
  ],
  // 49: Tập trượt patin
  [
    { name: 'Giày trượt đỏ', emoji: '🛼' },
    { name: 'Băng cá nhân', emoji: '🩹' },
    { name: 'Ngón tay tốt', emoji: '👍' }
  ],
  // 50: Bắt bướm ở đồng cỏ
  [
    { name: 'Bướm nhỏ xinh', emoji: '🦋' },
    { name: 'Vợt bắt bướm', emoji: '🕸' },
    { name: 'Bông hoa nở', emoji: '🌸' }
  ],
  // 51: Mua truyện tranh ở nhà sách
  [
    { name: 'Cuốn truyện nhỏ', emoji: '📚' },
    { name: 'Đóng xu nhỏ', emoji: '🪙' },
    { name: 'Thẻ kẹp sách', emoji: '🔖' }
  ],
  // 52: Câu cá cùng ông nội
  [
    { name: 'Cần câu tre', emoji: '🎣' },
    { name: 'Con mồi nhỏ', emoji: '🐛' },
    { name: 'Chú cá nhỏ', emoji: '🐟' }
  ],
  // 53: Gấp thuyền giấy
  [
    { name: 'Thuyền giấy đỏ', emoji: '⛵' },
    { name: 'Chiếc ô nhỏ', emoji: '☔' },
    { name: 'Vũng nước nhỏ', emoji: '🌊' }
  ],
  // 54: Tham gia cuộc thi vẽ tranh
  [
    { name: 'Cầu vồng xinh', emoji: '🌈' },
    { name: 'Bút vẽ màu', emoji: '🖍' },
    { name: 'Huy chương vàng', emoji: '🏆' }
  ],
  // 55: Dựng lều bằng chăn trong phòng khách
  [
    { name: 'Lều chăn nhỏ', emoji: '⛺' },
    { name: 'Ghế sofa lớn', emoji: '🛋' },
    { name: 'Đèn pin nhỏ', emoji: '🔦' }
  ],
  // 56: Làm lồng đèn Trung Thu
  [
    { name: 'Lồng đèn sao', emoji: '🏮' },
    { name: 'Cành tre nhỏ', emoji: '🎋' },
    { name: 'Cây nến nhỏ', emoji: '🕯' }
  ],
  // 57: Xem múa lân
  [
    { name: 'Đầu lân đỏ', emoji: '🦁' },
    { name: 'Tiếng trống hội', emoji: '🥁' },
    { name: 'Cây bắp cải', emoji: '🥬' }
  ],
  // 58: Lạc đường trong siêu thị
  [
    { name: 'Chú bảo vệ', emoji: '🕵' },
    { name: 'Áo xanh mẹ', emoji: '👕' },
    { name: 'Chiếc loa nhỏ', emoji: '📢' }
  ],
  // 59: Làm thủ tục ở sân bay
  [
    { name: 'Máy bay lớn', emoji: '✈' },
    { name: 'Cuốn hộ chiếu', emoji: '🛂' },
    { name: 'Cửa sổ nhỏ', emoji: '🪟' }
  ],
  // 60: Tắm cho cún con
  [
    { name: 'Cún lấm bùn', emoji: '🐶' },
    { name: 'Bồn nước ấm', emoji: '🛁' },
    { name: 'Chai sữa tắm', emoji: '🧴' }
  ],
  // 61: Đi khám mắt
  [
    { name: 'Kính cận xanh', emoji: '👓' },
    { name: 'Bác sĩ mắt', emoji: '🩺' },
    { name: 'Bảng chữ đo', emoji: '👁' }
  ],
  // 62: Tô tượng
  [
    { name: 'Tượng Pikachu', emoji: '🖌' },
    { name: 'Khay pha màu', emoji: '🎨' },
    { name: 'Má đỏ tượng', emoji: '⚡' }
  ],
  // 63: Thăm quan trạm cứu hỏa
  [
    { name: 'Xe cứu hỏa', emoji: '🚒' },
    { name: 'Mũ bảo hộ', emoji: '🪖' },
    { name: 'Còi báo động', emoji: '🚨' }
  ],
  // 64: Xem múa rối nước
  [
    { name: 'Rồng múa nước', emoji: '🐉' },
    { name: 'Con rối gỗ', emoji: '🎭' },
    { name: 'Trống truyền thống', emoji: '🥁' }
  ],
  // 65: Trượt tuyết bằng ván
  [
    { name: 'Ván trượt tuyết', emoji: '🛷' },
    { name: 'Đồi tuyết trắng', emoji: '🏔' },
    { name: 'Bông tuyết nhỏ', emoji: '❄' }
  ],
  // 66: Bỏ ống heo tiết kiệm
  [
    { name: 'Heo đất hồng', emoji: '🐷' },
    { name: 'Đồng tiền nhỏ', emoji: '🪙' },
    { name: 'Chiếc xe đạp', emoji: '🚲' }
  ]
];

let stickerIdCounter = 103;
const stickers = [];
const missions = [];

for (const block of blocks) {
  // Extract fields
  const titleMatch = block.match(/\*   \*\*Tên tiếng Việt:\*\* (.+)/);
  const topicMatch = block.match(/\*   \*\*Topic:\*\* `([^`]+)`/);
  const iconMatch = block.match(/\*   \*\*Icon:\*\* `([^`]+)`/);

  if (!titleMatch || !topicMatch || !iconMatch) {
    console.log('Skipping block, missing metadata:', block.substring(0, 50));
    continue;
  }

  const title = titleMatch[1].trim();
  const topic = topicMatch[1].trim();
  const icon = iconMatch[1].trim();

  // Extract steps
  const steps = [];
  const stepBlocks = block.split(/\*   \*\*Bước \d+:\*\*/).slice(1);
  for (const stepBlock of stepBlocks) {
    const sentenceMatch = stepBlock.match(/\*   \*Câu thoại của trẻ:\* `"([^"]+)"`/);
    const intentMatch = stepBlock.match(/\*   \*Ý định \(Intent\):\* `([^`]+)`/);
    if (sentenceMatch && intentMatch) {
      steps.push({
        sentence: sentenceMatch[1].trim(),
        intent: intentMatch[1].trim()
      });
    }
  }

  if (steps.length !== 5) {
    console.log('Skipping block, steps != 5:', title);
    continue;
  }

  // Generate 3 stickers for this mission
  const pool = [];
  const missionIndex = missions.length;
  const missionStickers = customStickers[missionIndex] || [];
  
  for (let i = 0; i < 3; i++) {
    const sId = `sticker-${stickerIdCounter}`;
    const customSticker = missionStickers[i] || { name: `Sticker ${title} ${i + 1}`, emoji: icon };
    const sName = customSticker.name;
    const sEmoji = customSticker.emoji;
    stickers.push(`  ('${sId}', '${escapeSql(sName)}', 'rewards', '${sEmoji}', ${stickerIdCounter})`);
    pool.push(`'${sId}'`);
    stickerIdCounter++;
  }

  missions.push({ title, topic, icon, pool, steps });
}

let sql = `-- Auto-generated SQL for 66 missions

insert into stickers (id, name, theme, emoji, sort_order) values
${stickers.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji;

do $$
declare
  m record;
  v_mission_id uuid;
begin
  for m in (
    select * from (values
`;

const values = missions.map(m => {
  return `      ('${escapeSql(m.title)}', '${escapeSql(m.topic)}', '${m.icon}',
        array[${m.pool.join(', ')}],
        '${escapeSql(m.steps[0].sentence)}', '${escapeSql(m.steps[0].intent)}',
        '${escapeSql(m.steps[1].sentence)}', '${escapeSql(m.steps[1].intent)}',
        '${escapeSql(m.steps[2].sentence)}', '${escapeSql(m.steps[2].intent)}',
        '${escapeSql(m.steps[3].sentence)}', '${escapeSql(m.steps[3].intent)}',
        '${escapeSql(m.steps[4].sentence)}', '${escapeSql(m.steps[4].intent)}')`;
});

sql += values.join(',\n') + `
    ) as t(title, topic, icon, pool, s1, i1, s2, i2, s3, i3, s4, i4, s5, i5)
  )
  loop
    if not exists (select 1 from missions where title = m.title) then
      insert into missions (id, language_id, title, topic, level, step_count, sticker_pool, icon)
      values (gen_random_uuid(), 'en', m.title, m.topic, 'beginner', 5, m.pool, m.icon)
      returning id into v_mission_id;

      insert into mission_steps (mission_id, step_order, target_sentence, intent) values
        (v_mission_id, 1, m.s1, m.i1),
        (v_mission_id, 2, m.s2, m.i2),
        (v_mission_id, 3, m.s3, m.i3),
        (v_mission_id, 4, m.s4, m.i4),
        (v_mission_id, 5, m.s5, m.i5);
    else
      -- Update sticker_pool for existing missions
      update missions
      set sticker_pool = m.pool
      where title = m.title;
    end if;
  end loop;
end $$;
`;

fs.writeFileSync(sqlPath, sql, 'utf-8');
console.log('Generated SQL to', sqlPath);
