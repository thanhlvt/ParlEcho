import { buildWavHeader, pcmToWav, bytesToBase64, concatUint8Arrays } from './audioFormat';

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe('buildWavHeader', () => {
  it('writes RIFF/WAVE/fmt /data magic numbers at the right offsets', () => {
    const header = buildWavHeader(1000, 16000, 16);
    expect(readAscii(header, 0, 4)).toBe('RIFF');
    expect(readAscii(header, 8, 4)).toBe('WAVE');
    expect(readAscii(header, 12, 4)).toBe('fmt ');
    expect(readAscii(header, 36, 4)).toBe('data');
  });

  it('is always 44 bytes', () => {
    expect(buildWavHeader(0).byteLength).toBe(44);
    expect(buildWavHeader(123456).byteLength).toBe(44);
  });

  it('encodes data chunk size and RIFF chunk size from pcmByteLength', () => {
    const header = buildWavHeader(1000, 16000, 16);
    const v = new DataView(header.buffer, header.byteOffset, header.byteLength);
    expect(v.getUint32(40, true)).toBe(1000); // data chunk size
    expect(v.getUint32(4, true)).toBe(36 + 1000); // RIFF chunk size
  });

  it('encodes sample rate, byte rate and block align for mono 16-bit', () => {
    const header = buildWavHeader(1000, 24000, 16);
    const v = new DataView(header.buffer, header.byteOffset, header.byteLength);
    expect(v.getUint16(22, true)).toBe(1); // numChannels
    expect(v.getUint32(24, true)).toBe(24000); // sampleRate
    expect(v.getUint32(28, true)).toBe(24000 * 1 * (16 / 8)); // byteRate
    expect(v.getUint16(32, true)).toBe(1 * (16 / 8)); // blockAlign
    expect(v.getUint16(34, true)).toBe(16); // bitDepth
  });
});

describe('pcmToWav', () => {
  it('prefixes the PCM data with a 44-byte header', () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5]);
    const wav = pcmToWav(pcm, 16000, 16);
    expect(wav.byteLength).toBe(44 + pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it('handles empty PCM input', () => {
    const wav = pcmToWav(new Uint8Array(0));
    expect(wav.byteLength).toBe(44);
  });
});

describe('concatUint8Arrays', () => {
  it('concatenates multiple chunks in order', () => {
    const result = concatUint8Arrays([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5, 6]),
    ]);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('handles an empty array list', () => {
    expect(concatUint8Arrays([])).toEqual(new Uint8Array(0));
  });

  it('handles chunks that include empty arrays', () => {
    const result = concatUint8Arrays([new Uint8Array([1]), new Uint8Array(0), new Uint8Array([2])]);
    expect(result).toEqual(new Uint8Array([1, 2]));
  });
});

describe('bytesToBase64', () => {
  it('matches Buffer base64 encoding for a small array', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('matches Buffer base64 encoding for an array larger than the chunk size (8192)', () => {
    const bytes = new Uint8Array(20000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('handles empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});
