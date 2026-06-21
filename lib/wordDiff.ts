import { WordScore } from './types';

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function charSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 100 : Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

// Word-level alignment (Levenshtein ở mức từ, có backtrack) — so khớp theo vị trí cố
// định sẽ lệch toàn bộ phần còn lại của câu chỉ vì 1 từ bị tách/gộp khác số từ (ví dụ
// "the intercom" nói thành "zincall"). Alignment tự "đồng bộ lại" sau lỗi cục bộ bằng
// cách cho phép xoá (từ ref bị thiếu trong transcript) / chèn (từ thừa trong transcript)
// với chi phí cố định, và chỉ thay thế khi rẻ hơn xoá+chèn.
// Trả về, với mỗi từ ref, từ transcript được khớp (hoặc null nếu bị coi là thiếu).
function alignWords(refWords: string[], hypWords: string[]): (string | null)[] {
  const m = refWords.length,
    n = hypWords.length;
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) cost[i][0] = i;
  for (let j = 0; j <= n; j++) cost[0][j] = j;

  const subCost = (i: number, j: number) =>
    refWords[i - 1] === hypWords[j - 1]
      ? 0
      : 1 - charSimilarity(refWords[i - 1], hypWords[j - 1]) / 100;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + subCost(i, j), // khớp/thay thế
        cost[i - 1][j] + 1, // ref[i-1] bị thiếu trong transcript
        cost[i][j - 1] + 1, // transcript[j-1] là từ thừa
      );
    }
  }

  const aligned: (string | null)[] = new Array(m).fill(null);
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + subCost(i, j)) {
      aligned[i - 1] = hypWords[j - 1];
      i--;
      j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      aligned[i - 1] = null;
      i--;
    } else {
      j--;
    }
  }
  return aligned;
}

// So khớp câu mẫu (reference) với transcript Gemini nghe được bằng word alignment —
// dùng để highlight câu mẫu: từ nào bị nói thiếu/khác quá nhiều sẽ bị đánh dấu lỗi.
export function compareWords(reference: string, transcript: string): WordScore[] {
  const refWords = normalizeWords(reference);
  const hypWords = normalizeWords(transcript);
  const aligned = alignWords(refWords, hypWords);

  return refWords.map((refWord, i) => {
    const hypWord = aligned[i];
    const score = hypWord === null ? 0 : charSimilarity(hypWord, refWord);
    const error_type =
      hypWord === null
        ? 'Omission'
        : score < 60
          ? 'Mispronunciation'
          : score < 85
            ? 'UnexpectedBreak'
            : null;
    return { word: refWord, score, error_type };
  });
}
