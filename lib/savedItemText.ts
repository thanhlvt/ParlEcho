// saved_items.content có thể chứa cả phần dịch/giải thích phía sau từ/câu chính (vd
// "hello - xin chào", "draw: vẽ", "self-esteem (tự trọng)") — chỉ phần ĐẦU mới là thứ cần đọc
// to/luyện phát âm. Dùng chung cho TTS (app/(app)/notebook.tsx#handleSpeak) và chấm phát âm
// (PronouncePracticeModal — reference_text/so khớp transcript) để 2 nơi luôn khớp nhau: câu mẫu
// chấm điểm phải đúng bằng phần đã phát âm cho người dùng nghe, không phải toàn bộ content.
export function extractMainText(content: string): string {
  // 1. Cắt theo dấu gạch ngang có khoảng trắng quanh (bảo toàn từ ghép như "self-esteem")
  let text = content.split(/\s+[\-–—]\s+/)[0];
  // 2. Cắt theo dấu hai chấm / dấu ngã (~/～), có hoặc không khoảng trắng quanh
  text = text.split(/\s*[:：~～]\s*/)[0];
  // 3. Cắt theo dấu mở ngoặc (nửa rộng/đầy rộng)
  text = text.split(/[\(（]/)[0];
  return text.trim();
}
