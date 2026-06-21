/**
 * scripts/spike-guided-opening.mjs — TECHNICAL SPIKE (throwaway)
 *
 * Reproduces the Kid Mode Guided Conversation OPENING to diagnose "AI says the
 * first sentence twice". Mirrors lib/liveClient.ts + live-token: kid_guided
 * system prompt + two BLOCKING tools + the hidden GUIDED_OPENING_TEXT turn.
 *
 * It logs every server message and prints, per model turn, the accumulated
 * output transcription — so we can see whether the model produces ONE greeting
 * turn or TWO (i.e. whether the doubling is the model itself, not the app).
 *
 * Run:  node scripts/spike-guided-opening.mjs
 * Needs scripts/.env.scripts with GOOGLE_GENAI_API_KEY.
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
  console.error('Missing GOOGLE_GENAI_API_KEY in scripts/.env.scripts');
  process.exit(1);
}

const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
const WSS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const MARK_STEP_TOOL = 'mark_step_complete';
const OFF_TOPIC_TOOL = 'report_off_topic';

// Mock mission (mirrors mission_steps shape).
const MISSION = {
  title: 'Buy crayons',
  topic: 'toy shop',
  steps: [
    { stepOrder: 1, targetSentence: 'Hello!', intent: 'the child greets the shopkeeper' },
    {
      stepOrder: 2,
      targetSentence: 'Can I have a box of crayons, please?',
      intent: 'the child asks for crayons',
    },
    { stepOrder: 3, targetSentence: 'Thank you! Goodbye!', intent: 'the child says goodbye' },
  ],
};

// Mirror buildKidGuidedPrompt (supabase/functions/live-token/index.ts).
function buildKidGuidedPrompt() {
  const name = 'Leo';
  const personality = 'a warm, encouraging companion';
  const langLabel = 'English';
  const stepsList = MISSION.steps
    .map((s) => `Step ${s.stepOrder}: goal sentence "${s.targetSentence}" — reached when ${s.intent}`)
    .join('\n');
  return (
    `You are ${name}, ${personality}. You are talking to a young child who is learning ${langLabel}. ` +
    `Always speak and behave as ${name} — never say you are an AI or a language model. ` +
    `You must speak with an American English accent (en-US). ` +
    `Speak in an enthusiastic, warm, encouraging, and highly simplified tone suitable for children. Use very short, simple sentences. ` +
    `You are guiding the child through a mission called "${MISSION.title}" (${MISSION.topic}), step by step, in this exact order:\n` +
    `${stepsList}\n` +
    `You have two tools. Calling a tool is silent — the child never hears it.\n` +
    `- ${MARK_STEP_TOOL}(step_order): call this ONLY after the child has actually SPOKEN an answer that satisfies the CURRENT step's goal.\n` +
    `- ${OFF_TOPIC_TOOL}(): call this when the child says something unrelated to the current step.\n` +
    `Your very first turn in this conversation will be a hidden instruction (not from the child) telling you to start.\n` +
    `Rules:\n` +
    `1. Only work on ONE step at a time, starting at step 1. Ask a closed question or give exactly two choices.\n` +
    `2. When the child has SPOKEN a reply that satisfies the CURRENT step's goal: immediately call ${MARK_STEP_TOOL} and stay SILENT until the tool result, then say your praise and the next question exactly once.\n` +
    `3. The LAST step works like every other step: ask, WAIT for the child to answer, then call ${MARK_STEP_TOOL} and say goodbye.\n` +
    `8. Say each thing only ONCE. Never repeat or rephrase the same praise/question/goodbye — not within a reply, and not across a tool call.`
  );
}

const GUIDED_OPENING_TEXT =
  'Start the mission now. Greet the child warmly in one short sentence, then ask about Step 1 ' +
  'using a closed question or exactly two choices, following the rules above. Do not wait for ' +
  'the child to speak first. Say your greeting and the Step 1 question only ONCE — never repeat them.';

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

async function main() {
  console.log('[spike] minting ephemeral token...');
  const token = await mintToken();
  console.log('[spike] token minted');

  const ws = new WebSocket(`${WSS_BASE}?access_token=${encodeURIComponent(token)}`);
  ws.binaryType = 'arraybuffer';
  const send = (obj) => ws.send(JSON.stringify(obj));

  let turnIndex = 0;
  let currentTurnText = '';
  let audioChunksThisTurn = 0;
  const turns = [];
  let openingSent = false;
  // Mô phỏng app: sau N lượt AI không gọi tool, gửi reminder ẩn (đây là nghi phạm gây re-greet).
  // Đặt SEND_REMINDER=false để mô phỏng bản đã sửa (gate reminder khi trẻ chưa nói).
  const SEND_REMINDER = process.env.SEND_REMINDER !== 'false';
  const STEP_REMINDER_AFTER_TURNS = 2;
  let turnsSinceStepEvent = 0;
  let reminderSent = false;

  // End a few seconds after the first turn completes (catch any extra/duplicate turn).
  let endTimer = null;
  const scheduleEnd = () => {
    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(() => finish(), 6000);
  };
  const hardTimeout = setTimeout(() => finish('hard timeout 45s'), 45000);

  const finish = (note = '') => {
    clearTimeout(hardTimeout);
    if (endTimer) clearTimeout(endTimer);
    console.log('\n========== SPIKE RESULT ==========');
    if (note) console.log('note:', note);
    console.log('Total model turns for the opening:', turns.length);
    turns.forEach((t, i) =>
      console.log(`  turn ${i + 1}: audioChunks=${t.audioChunks} text=${JSON.stringify(t.text)}`),
    );
    // Only turns WITH audio are heard by the child; empty turns are silent.
    const spokenTurns = turns.filter((t) => t.audioChunks > 0);
    console.log('\nVerdict:');
    if (spokenTurns.length >= 2) {
      console.log(
        `  ⚠️ Child hears ${spokenTurns.length} spoken turns at the opening → double-greeting reproduced.`,
      );
    } else {
      console.log(
        `  ✅ Child hears ${spokenTurns.length} spoken turn at the opening (no double-greeting).`,
      );
    }
    console.log('==================================');
    try {
      ws.close();
    } catch {}
    process.exit(0);
  };

  ws.onopen = () => {
    console.log('[spike] WS open — sending setup (kid_guided + tools)');
    send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          temperature: 0.6,
          maxOutputTokens: 500,
        },
        systemInstruction: { parts: [{ text: buildKidGuidedPrompt() }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: MARK_STEP_TOOL,
                description: 'Call after the child completed the current step.',
                parameters: {
                  type: 'object',
                  properties: { step_order: { type: 'integer' } },
                  required: ['step_order'],
                },
              },
              {
                name: OFF_TOPIC_TOOL,
                description: 'Call when the child is off-topic.',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
        ],
      },
    });
  };

  ws.onmessage = (ev) => {
    const text = typeof ev.data === 'string' ? ev.data : new TextDecoder('utf-8').decode(ev.data);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete !== undefined) {
      if (!openingSent) {
        openingSent = true;
        console.log('[spike] setupComplete — sending GUIDED_OPENING_TEXT (once)');
        send({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: GUIDED_OPENING_TEXT }] }],
            turnComplete: true,
          },
        });
      }
      return;
    }

    if (msg.toolCall) {
      const fcs = msg.toolCall.functionCalls ?? [];
      console.log('[spike] toolCall:', fcs.map((f) => `${f.name}(${JSON.stringify(f.args)})`).join(', '));
      // Respond immediately (BLOCKING) like the app does.
      send({
        toolResponse: {
          functionResponses: fcs.map((f) => ({ id: f.id, name: f.name, response: { result: 'success' } })),
        },
      });
      return;
    }

    const sc = msg.serverContent;
    if (!sc) {
      const keys = Object.keys(msg).join(',');
      if (keys) console.log('[spike] other message:', keys);
      return;
    }

    const parts = sc.modelTurn?.parts;
    if (parts) {
      for (const p of parts) if (p.inlineData?.data) audioChunksThisTurn++;
    }
    if (sc.outputTranscription?.text) currentTurnText += sc.outputTranscription.text;

    if (sc.turnComplete || sc.generationComplete) {
      turnIndex++;
      turns.push({ audioChunks: audioChunksThisTurn, text: currentTurnText });
      console.log(
        `[spike] >>> TURN ${turnIndex} complete: audioChunks=${audioChunksThisTurn} text=${JSON.stringify(
          currentTurnText.trim(),
        )}`,
      );
      currentTurnText = '';
      audioChunksThisTurn = 0;

      // Replicate the app's old reminder logic (NO child turn in between — pure opening).
      turnsSinceStepEvent++;
      if (SEND_REMINDER && !reminderSent && turnsSinceStepEvent >= STEP_REMINDER_AFTER_TURNS) {
        reminderSent = true;
        const step = MISSION.steps[0];
        const reminder =
          `(Reminder for you, the AI — do not say this out loud or mention it to the child): ` +
          `You are still on Step ${step.stepOrder} — goal: "${step.targetSentence}" (reached when ${step.intent}). ` +
          `If the child's last reply already satisfies this goal, call the ${MARK_STEP_TOOL} function now ` +
          `with step_order ${step.stepOrder}, then praise them and move on to the next step.`;
        console.log('[spike] >>> sending hidden REMINDER (mimics app) — watch for a re-greet/re-ask');
        send({ clientContent: { turns: [{ role: 'user', parts: [{ text: reminder }] }], turnComplete: true } });
      }
      scheduleEnd();
    }
  };

  ws.onerror = (e) => finish('ws error: ' + (e?.message ?? String(e)));
  ws.onclose = (e) => {
    if (turns.length === 0) finish(`closed before any turn code=${e.code} reason="${e.reason}"`);
  };
}

main().catch((e) => {
  console.error('[spike] fatal:', e);
  process.exit(1);
});
