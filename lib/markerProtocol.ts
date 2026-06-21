// Kid Mode (guided): DEFENSIVE display cleanup. Tiến trình bước/lạc đề nay do FUNCTION CALL
// điều khiển (xem liveClient.ts _handleStepComplete / _handleOffTopic), KHÔNG còn dùng marker.
// Hai hàm này chỉ strip nốt marker cũ nếu model lỡ đọc trại "step done"/"off topic" vào audio,
// để không lọt vào transcript hiển thị/lưu trữ (liveClient.ts _stripLeftoverMarkers). Match fuzzy
// để chịu được transcription bỏ ngoặc/đọc trại.
const STEP_DONE_RE = /\[?\s*step[\s_]*done\s*\]?/gi;
const OFFTOPIC_RE = /\[?\s*off[\s_]*topic\s*\]?/gi;

function stripMarker(text: string, re: RegExp): { matched: boolean; cleaned: string } {
  const replaced = text.replace(re, '');
  return { matched: replaced !== text, cleaned: replaced.trim() };
}

export function stripStepDoneMarker(text: string): { matched: boolean; cleaned: string } {
  return stripMarker(text, STEP_DONE_RE);
}

export function stripOffTopicMarker(text: string): { matched: boolean; cleaned: string } {
  return stripMarker(text, OFFTOPIC_RE);
}
