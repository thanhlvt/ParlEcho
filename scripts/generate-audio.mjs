/**
 * scripts/generate-audio.mjs
 *
 * Pre-generates TTS audio for every scenario_line where audio_url IS NULL.
 * Idempotent: lines that already have audio_url are skipped.
 *
 * Setup (one-time):
 *   Copy .env.scripts.example → .env.scripts, fill in values.
 *
 * Run:
 *   node scripts/generate-audio.mjs
 *
 * Requires Node 18+.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env ──────────────────────────────────────────────────────────────
function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* file missing is fine */ }
}

// Look for .env.scripts next to this script file, then fall back to project root .env
loadEnvFile(join(__dirname, '.env.scripts'));
loadEnvFile(join(__dirname, '..', '.env'));

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GEMINI_KEY    = process.env.GOOGLE_GENAI_API_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
  console.error(
    '\nMissing required env vars:\n' +
    (SUPABASE_URL  ? '' : '  EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL)\n') +
    (SERVICE_KEY   ? '' : '  SUPABASE_SERVICE_ROLE_KEY\n') +
    (GEMINI_KEY    ? '' : '  GOOGLE_GENAI_API_KEY\n') +
    '\nCreate .env.scripts with these values and re-run.\n',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Config ────────────────────────────────────────────────────────────────
const TTS_MODEL   = 'gemini-3.1-flash-tts-preview';
const VOICE       = 'Kore';
const BUCKET      = 'tts';
const DELAY_MS    = 600;   // rate-limit: ~100 RPM free tier → ~1 req/600ms

// ── WAV builder (24 kHz, 16-bit, mono) ───────────────────────────────────
function buildWav(pcm) {
  const sampleRate = 24000, ch = 1, bits = 16;
  const byteRate = sampleRate * ch * (bits / 8);
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write('RIFF',  0);  buf.writeUInt32LE(36 + pcm.length, 4);
  buf.write('WAVE',  8);  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);  buf.writeUInt16LE(1,         20);  // PCM
  buf.writeUInt16LE(ch, 22);  buf.writeUInt32LE(sampleRate,24);
  buf.writeUInt32LE(byteRate, 28);  buf.writeUInt16LE(ch * bits / 8, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36);  buf.writeUInt32LE(pcm.length, 40);
  pcm.copy(buf, 44);
  return buf;
}

// ── Gemini TTS call ───────────────────────────────────────────────────────
async function callGeminiTts(text) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    },
  );

  if (!resp.ok) throw new Error(`Gemini TTS HTTP ${resp.status}: ${await resp.text()}`);

  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find(p => p.inlineData?.mimeType?.startsWith('audio'));
  const pcmBase64 = audioPart?.inlineData?.data ?? '';

  if (!pcmBase64) {
    const finishReason = json.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`No audio data returned. finishReason=${finishReason}`);
  }

  return buildWav(Buffer.from(pcmBase64, 'base64'));
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('ParlEcho audio pre-generator\n');

  // Fetch lines without audio
  const { data: lines, error: fetchErr } = await supabase
    .from('scenario_lines')
    .select('id, scenario_id, language_id, sort_order, speaker, text')
    .is('audio_url', null)
    .order('scenario_id')
    .order('sort_order');

  if (fetchErr) {
    console.error('Failed to fetch scenario_lines:', fetchErr.message);
    process.exit(1);
  }

  if (!lines.length) {
    console.log('All scenario_lines already have audio. Nothing to do.');
    return;
  }

  console.log(`Found ${lines.length} line(s) without audio.\n`);

  let ok = 0, failed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = `[${i + 1}/${lines.length}] [${line.language_id}] sort=${line.sort_order} "${line.text.slice(0, 50)}${line.text.length > 50 ? '…' : ''}"`;
    process.stdout.write(`${prefix}\n  → generating... `);

    try {
      // 1. Generate audio
      const wav = await callGeminiTts(line.text);

      // 2. Upload to storage — path: lines/{line_id}.wav (deterministic, safe to re-run)
      const storagePath = `lines/${line.id}.wav`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, wav, { contentType: 'audio/wav', upsert: true });

      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      // 3. Get public URL
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

      // 4. Update scenario_lines.audio_url
      const { error: updateErr } = await supabase
        .from('scenario_lines')
        .update({ audio_url: publicUrl })
        .eq('id', line.id);

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

      console.log(`OK  (${(wav.length / 1024).toFixed(0)} KB)`);
      ok++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }

    // Rate limit delay between requests
    if (i < lines.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n──────────────────────────────────`);
  console.log(`Done: ${ok} generated, ${failed} failed.`);
  if (failed > 0) console.log(`Re-run the script to retry failed lines.`);
}

main().catch(err => { console.error(err); process.exit(1); });
