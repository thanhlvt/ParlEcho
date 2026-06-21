// Kid Mode (guided): DEFENSIVE display cleanup. Tiến trình bước/lạc đề nay do FUNCTION CALL
// điều khiển (xem liveClient.ts _handleStepComplete / _handleOffTopic), KHÔNG còn dùng marker.
// Các hàm này chỉ strip những thứ model lỡ đọc thành tiếng vào audio để không lọt vào transcript
// hiển thị/lưu trữ (liveClient.ts _stripLeftoverMarkers): marker cũ ("step done"/"off topic")
// và cú pháp gọi hàm rò rỉ ("report_off_topic()", "mark_step_complete(...)", "report_("). Match
// fuzzy để chịu được transcription bỏ ngoặc/đọc trại.
const STEP_DONE_RE = /\[?\s*step[\s_]*done\s*\]?/gi;
const OFFTOPIC_RE = /\[?\s*off[\s_]*topic\s*\]?/gi;
// Tên tool kèm dấu ngoặc (kể cả dạng cụt "report_(") — model đôi khi phát âm thay vì gọi tool ngầm.
const TOOL_CALL_SYNTAX_RE =
  /\b(?:mark_step_complete|report_off_topic|mark_|report_)\s*\([^)]*\)?/gi;
// Tên tool trần (không ngoặc).
const TOOL_NAME_RE = /\b(?:mark_step_complete|report_off_topic)\b/gi;

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

export function stripToolCallArtifacts(text: string): { matched: boolean; cleaned: string } {
  const replaced = text.replace(TOOL_CALL_SYNTAX_RE, '').replace(TOOL_NAME_RE, '');
  return { matched: replaced !== text, cleaned: replaced.replace(/\s{2,}/g, ' ').trim() };
}
