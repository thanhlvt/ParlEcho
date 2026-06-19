import * as Crypto from 'expo-crypto';

/** Hash mã PIN 4 số phụ huynh (SHA-256) — không lưu plaintext vào profiles.parent_pin. */
export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}
