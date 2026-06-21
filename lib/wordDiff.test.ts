import { compareWords } from './wordDiff';

describe('compareWords', () => {
  it('marks all words as good when transcript matches reference exactly', () => {
    const result = compareWords('I want to go home', 'I want to go home');
    expect(result).toHaveLength(5);
    expect(result.every((w) => w.error_type === null)).toBe(true);
  });

  it('marks trailing words as Omission when the sentence is cut short', () => {
    const result = compareWords('I want to go home', 'I want to');
    expect(result.map((w) => w.error_type)).toEqual([null, null, null, 'Omission', 'Omission']);
  });

  it('marks a completely different word as Mispronunciation', () => {
    const result = compareWords('I want to go home', 'I want to go xyzzy');
    expect(result[4].error_type).toBe('Mispronunciation');
  });

  it('is case-insensitive and ignores punctuation', () => {
    const result = compareWords('Hello, world!', 'hello world');
    expect(result.every((w) => w.error_type === null)).toBe(true);
  });

  it('returns an empty array for an empty reference', () => {
    expect(compareWords('', 'anything')).toEqual([]);
  });

  it('re-syncs after a word-count mismatch instead of shifting the rest of the sentence', () => {
    // "the intercom" (2 từ) bị nói/nghe thành "zincall" (1 từ) — phần còn lại của câu
    // ("is a bit crackly...") vẫn được nói đúng và phải được nhận đúng, không bị lệch.
    const reference = 'Sorry, the intercom is a bit crackly. Could you say that again, please?';
    const transcript = 'Sorry, zincall is a bit crackly. Could you say that again, please?';
    const result = compareWords(reference, transcript);
    const errorWords = result.filter((w) => w.error_type !== null).map((w) => w.word);
    expect(errorWords).toEqual(['the', 'intercom']);
  });
});
