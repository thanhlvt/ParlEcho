// Kid Mode (guided): marker AI chèn cuối lời nói (qua outputTranscription) để báo tiến trình.
// Match fuzzy để chịu được transcription bỏ ngoặc/đọc trại (xem liveClient.ts _consumeMarkers).
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
