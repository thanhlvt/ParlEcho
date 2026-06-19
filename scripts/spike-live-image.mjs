/**
 * scripts/spike-live-image.mjs  — TECHNICAL SPIKE (throwaway)
 *
 * Verifies risk #1 of the Kid Mode plan: can a Gemini Live session created with
 * an EPHEMERAL TOKEN (constrained endpoint BidiGenerateContentConstrained — the
 * exact path the app uses) receive an IMAGE as input and actually "see" it?
 *
 * Method: build a solid-RED PNG, mint an ephemeral token exactly like the
 * live-token edge function, open the constrained WebSocket, send the image via
 * clientContent inlineData + ask "what single color?", read the model's audio
 * transcription. If it answers "red", the multimodal pipeline works end-to-end.
 *
 * Run:  node scripts/spike-live-image.mjs
 * Needs scripts/.env.scripts with GOOGLE_GENAI_API_KEY.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
}
loadEnvFile(join(__dirname, '.env.scripts'));
loadEnvFile(join(__dirname, '..', '.env'));

const GEMINI_KEY = process.env.GOOGLE_GENAI_API_KEY ?? '';
if (!GEMINI_KEY) {
  console.error('Missing GOOGLE_GENAI_API_KEY in scripts/.env.scripts');
  process.exit(1);
}

// Same constants as the app (lib/liveClient.ts + live-token edge function)
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
const WSS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

// ── build a 64x64 solid-red PNG (no deps) ───────────────────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function solidRedPngBase64(size = 64) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // 10,11,12 = compression/filter/interlace = 0
  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.concat(Array.from({ length: size }, () => Buffer.from([255, 0, 0]))),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return png.toString('base64');
}

// ── mint ephemeral token (mirrors live-token/index.ts) ──────────────────────
async function mintToken() {
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 15 * 60 * 1000).toISOString();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uses: 1, expireTime, newSessionExpireTime }),
    },
  );
  if (!resp.ok) throw new Error(`auth_tokens error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  if (!data.name) throw new Error('No token name returned');
  return data.name;
}

// ── run spike ───────────────────────────────────────────────────────────────
async function main() {
  console.log('[spike] minting ephemeral token...');
  const token = await mintToken();
  console.log('[spike] token minted:', token.slice(0, 24) + '...');

  const imageB64 = solidRedPngBase64();
  console.log('[spike] test image: 64x64 solid-red PNG, base64 length =', imageB64.length);

  const url = `${WSS_BASE}?access_token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  let transcript = '';
  let gotAudio = false;
  let verdict = 'NO RESPONSE';

  const finish = (msg, code = 0) => {
    console.log('\n========== SPIKE RESULT ==========');
    console.log(msg);
    console.log('Model audio received :', gotAudio);
    console.log('Model said (transcript):', JSON.stringify(transcript.trim()));
    console.log('Verdict              :', verdict);
    console.log('==================================');
    try {
      ws.close();
    } catch {}
    process.exit(code);
  };

  const timeout = setTimeout(() => finish('TIMEOUT — no turn completion within 30s', 1), 30000);

  const send = (obj) => ws.send(JSON.stringify(obj));

  ws.onopen = () => {
    console.log('[spike] WS open — sending setup');
    send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: {
          parts: [{ text: 'You are a helpful assistant. Answer briefly.' }],
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
    });
  };

  ws.onmessage = (ev) => {
    let text;
    if (typeof ev.data === 'string') text = ev.data;
    else text = new TextDecoder('utf-8').decode(ev.data);

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete !== undefined) {
      console.log('[spike] setupComplete — sending IMAGE via clientContent inlineData');
      send({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/png', data: imageB64 } },
                { text: 'What single color do you see in this picture? Answer with one word.' },
              ],
            },
          ],
          turnComplete: true,
        },
      });
      return;
    }

    const sc = msg.serverContent;
    if (!sc) {
      const keys = Object.keys(msg).join(',');
      if (keys) console.log('[spike] non-serverContent message:', keys);
      return;
    }

    const parts = sc.modelTurn?.parts;
    if (parts) {
      for (const p of parts) {
        if (p.inlineData?.data) gotAudio = true;
      }
    }
    if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;

    if (sc.turnComplete || sc.generationComplete) {
      clearTimeout(timeout);
      const said = transcript.toLowerCase();
      if (said.includes('red')) {
        verdict = 'PASS ✅ — model saw the image (answered "red") via ephemeral-token constrained endpoint';
        finish('Image input WORKS on the constrained/ephemeral path.', 0);
      } else {
        verdict =
          'INCONCLUSIVE ⚠️ — turn completed but answer did not mention "red". Check transcript.';
        finish('Got a response but color not confirmed.', 2);
      }
    }
  };

  ws.onerror = (e) => {
    clearTimeout(timeout);
    verdict = 'FAIL ❌ — WebSocket error';
    finish('WebSocket error: ' + (e?.message ?? String(e)), 1);
  };

  ws.onclose = (e) => {
    clearTimeout(timeout);
    if (verdict === 'NO RESPONSE') {
      verdict = `FAIL ❌ — closed code=${e.code} reason="${e.reason}"`;
      finish('Connection closed before any answer.', 1);
    }
  };
}

main().catch((e) => {
  console.error('[spike] fatal:', e);
  process.exit(1);
});
