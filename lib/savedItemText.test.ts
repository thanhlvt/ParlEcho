import { extractMainText } from './savedItemText';

describe('extractMainText', () => {
  it('returns the text unchanged when there is no delimiter', () => {
    expect(extractMainText('weather')).toBe('weather');
  });

  it('cuts at a dash surrounded by spaces, preserving compound words', () => {
    expect(extractMainText('hello - xin chào')).toBe('hello');
    expect(extractMainText('self-esteem - tự trọng')).toBe('self-esteem');
  });

  it('cuts at a colon with or without surrounding spaces', () => {
    expect(extractMainText('draw: vẽ')).toBe('draw');
    expect(extractMainText('draw : vẽ')).toBe('draw');
  });

  it('cuts at a fullwidth colon or tilde', () => {
    expect(extractMainText('絵：vẽ')).toBe('絵');
    expect(extractMainText('weather~nice')).toBe('weather');
  });

  it('cuts at an opening parenthesis (half-width and full-width)', () => {
    expect(extractMainText('self-esteem (tự trọng)')).toBe('self-esteem');
    expect(extractMainText('天気（てんき）')).toBe('天気');
  });

  it('trims surrounding whitespace', () => {
    expect(extractMainText('  weather  ')).toBe('weather');
  });

  it('only cuts at the first delimiter when multiple are present', () => {
    expect(extractMainText('hello - xin chào (greeting)')).toBe('hello');
  });
});
