// WAV header mono 16-bit
export function buildWavHeader(
  pcmByteLength: number,
  sampleRate = 16000,
  bitDepth = 16,
): Uint8Array {
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);

  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };

  w(0, 'RIFF');
  v.setUint32(4, 36 + pcmByteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  w(36, 'data');
  v.setUint32(40, pcmByteLength, true);

  return new Uint8Array(header);
}

export function pcmToWav(pcm: Uint8Array, sampleRate = 16000, bitDepth = 16): Uint8Array {
  const header = buildWavHeader(pcm.length, sampleRate, bitDepth);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, 44);
  return wav;
}

// Ghép nhiều Uint8Array (chunk PCM từ mic streaming) thành một
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Convert Uint8Array to Base64 (safe for large arrays in React Native)
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    // @ts-ignore
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
