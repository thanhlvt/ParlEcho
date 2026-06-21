/**
 * scripts/spike-guided-fullflow.mjs — TECHNICAL SPIKE (throwaway)
 *
 * Plays a full Guided mission to diagnose "app does not auto-end after the last step".
 * Simulates the child by sending each step's target sentence as a clientContent TEXT turn,
 * then logs the ORDER of events at the last step: does `toolCall` (mark_step_complete) arrive
 * BEFORE or AFTER `turnComplete` of the goodbye? And does Gemini close the socket?
 *
 * The app advances progress on toolCall and ends on the NEXT onAiAudioDone (fired after a
 * turnComplete drain). If the final toolCall arrives AFTER the goodbye's turnComplete, the
 * app sets missionCompleted too late and never ends.
 *
 * Run:  node scripts/spike-guided-fullflow.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  console.error('Missing GOOGLE_GENAI_API_KEY');
  process.exit(1);
}

const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
const WSS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const MARK_STEP_TOOL = 'mark_step_complete';
const OFF_TOPIC_TOOL = 'report_off_topic';

const STEPS = [
  { stepOrder: 1, targetSentence: 'Hello!', intent: 'the child greets' },
  { stepOrder: 2, targetSentence: 'Thank you! Goodbye!', intent: 'the child says goodbye' },
];

function prompt() {
  const list = STEPS.map(
    (s) => `Step ${s.stepOrder}: goal sentence "${s.targetSentence}" — reached when ${s.intent}`,
  ).join('\n');
  return (
    `You are Leo, a warm companion talking to a young child learning English. Use very short sentences.\n` +
    `Mission "Say hi" — steps in order:\n${list}\n` +
    `Tools (silent, never spoken): ${MARK_STEP_TOOL}(step_order) when the child completed the current step; ${OFF_TOPIC_TOOL}().\n` +
    `Rules: ask one step at a time. When the child's spoken reply satisfies the current step, call ${MARK_STEP_TOOL} then praise and ask the next step. ` +
    `The LAST step works the same: after the child answers it, call ${MARK_STEP_TOOL} for the last step, then say goodbye.`
  );
}

async function mintToken() {
  const now = Date.now();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 15 * 60 * 1000).toISOString(),
      }),
    },
  );
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()).name;
}

const t0 = Date.now();
const ts = () => `+${String(Date.now() - t0).padStart(5)}ms`;

async function main() {
  const token = await mintToken();
  const ws = new WebSocket(`${WSS_BASE}?access_token=${encodeURIComponent(token)}`);
  ws.binaryType = 'arraybuffer';
  const send = (o) => ws.send(JSON.stringify(o));

  let stepIdx = 0; // which child sentence to send next
  let lastStepMarked = false;
  let audioThisTurn = 0;

  const sendChild = (text) => {
    console.log(`${ts()} CHILD → "${text}"`);
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } });
  };

  const end = (note) => {
    console.log(`\n========== RESULT ==========\n${note}\n============================`);
    try {
      ws.close();
    } catch {}
    process.exit(0);
  };
  const hard = setTimeout(() => end('hard timeout 60s'), 60000);

  ws.onopen = () =>
    send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: { responseModalities: ['AUDIO'], temperature: 0.6, maxOutputTokens: 500 },
        systemInstruction: { parts: [{ text: prompt() }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: MARK_STEP_TOOL,
                description: 'child finished current step',
                parameters: {
                  type: 'object',
                  properties: { step_order: { type: 'integer' } },
                  required: ['step_order'],
                },
              },
              { name: OFF_TOPIC_TOOL, description: 'off topic', parameters: { type: 'object', properties: {} } },
            ],
          },
        ],
      },
    });

  ws.onmessage = (ev) => {
    const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete !== undefined) {
      console.log(`${ts()} setupComplete → send opening`);
      send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: 'Start now: greet and ask Step 1.' }] }],
          turnComplete: true,
        },
      });
      return;
    }

    if (msg.toolCall) {
      const fcs = msg.toolCall.functionCalls ?? [];
      console.log(`${ts()} ⚙️  toolCall: ${fcs.map((f) => `${f.name}(${JSON.stringify(f.args)})`).join(', ')}`);
      if (fcs.some((f) => f.name === MARK_STEP_TOOL && (f.args?.step_order ?? 0) >= STEPS.length)) {
        lastStepMarked = true;
        console.log(`${ts()} 🟢 LAST-STEP mark_step_complete received`);
      }
      send({
        toolResponse: {
          functionResponses: fcs.map((f) => ({ id: f.id, name: f.name, response: { result: 'success' } })),
        },
      });
      return;
    }

    const sc = msg.serverContent;
    if (!sc) {
      const k = Object.keys(msg).join(',');
      if (k) console.log(`${ts()} (${k})`);
      return;
    }
    if (sc.modelTurn?.parts) for (const p of sc.modelTurn.parts) if (p.inlineData?.data) audioThisTurn++;
    if (sc.outputTranscription?.text) process.stdout.write('');

    if (sc.turnComplete || sc.generationComplete) {
      const hadAudio = audioThisTurn > 0;
      console.log(
        `${ts()} ── turnComplete (audioChunks=${audioThisTurn})${lastStepMarked ? '  [this turn is AFTER last-step mark]' : ''}`,
      );
      audioThisTurn = 0;

      if (lastStepMarked) {
        // We've seen the final mark. Wait to see if a goodbye turn (with audio) + close follow.
        if (hadAudio) {
          console.log(`${ts()} ✅ goodbye turn (with audio) came AFTER the last-step mark → onAiAudioDone would fire with missionCompleted=true`);
        }
        setTimeout(() => {
          clearTimeout(hard);
          end('End of mission reached.');
        }, 6000);
        return;
      }

      // Realistic turn-taking: only answer once the AI has actually SPOKEN a question (audio turn),
      // not on the empty trailing turn the model emits.
      if (hadAudio && stepIdx < STEPS.length) {
        const sentence = STEPS[stepIdx].targetSentence;
        stepIdx++;
        setTimeout(() => sendChild(sentence), 600);
      }
    }
  };

  ws.onclose = (e) => {
    clearTimeout(hard);
    end(`socket closed code=${e.code} reason="${e.reason}" lastStepMarked=${lastStepMarked}`);
  };
  ws.onerror = (e) => end('ws error ' + (e?.message ?? e));
}

main().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
