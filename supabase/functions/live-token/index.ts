import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

// Live API model — source: ai.google.dev/gemini-api/docs/live-api/get-started-websocket
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

// Giọng mặc định per ngôn ngữ (giống tts function)
const VOICE_BY_LANG: Record<string, string> = {
  en: 'Kore',
  ja: 'Kore',
};

const STYLE_PROMPTS: Record<string, string> = {
  casual: 'Speak in a friendly, informal, and relaxed tone.',
  formal: 'Speak in a polite, formal tone using standard grammar and honorifics where appropriate.',
  workplace: 'Use professional business language, industry terms, and a polite corporate tone.',
  beginner:
    'Speak very slowly, clearly, and use simple vocabulary suitable for a beginner language learner.',
  children:
    'Speak in an enthusiastic, warm, encouraging, and highly simplified tone suitable for children.',
};

const METHOD_PROMPTS: Record<string, string> = {
  free_talk: 'Maintain a natural, friendly, free-flowing conversation on various everyday topics.',
  consulting:
    'Act as an empathetic advisor. Ask thoughtful questions, listen actively, and help the user think through their problems.',
  interview:
    "Act as a professional interviewer. Ask structured questions one by one about the user's background, skills, and experience.",
  empathetic:
    "Be exceptionally supportive, warm, and understanding. Focus on validating the user's feelings and thoughts.",
  pressure:
    "Act as a tough challenger. Ask challenging follow-up questions, probe the user's arguments, and put moderate conversational pressure on them.",
};

// Kid Mode (guided): markers AI chèn vào cuối lời nói để client phát hiện tiến trình
// bước/lạc đề. Client (LiveClient) match fuzzy + strip khỏi text hiển thị. KHÔNG dùng
// function-calling vì model Live 3.1 không nói tiếp sau khi nhận toolResponse (treo phiên).
// PHẢI khớp STEP_DONE_MARKER / OFFTOPIC_MARKER trong lib/liveClient.ts.
const STEP_DONE_MARKER = '[STEP_DONE]';
const OFFTOPIC_MARKER = '[OFFTOPIC]';

interface MissionStepPayload {
  stepOrder: number;
  targetSentence: string;
  intent: string;
}

function buildKidGuidedPrompt(opts: {
  langLabel: string;
  accentPrompt: string;
  mission: { title: string; topic: string; steps: MissionStepPayload[] };
  companionName?: string;
  companionPersonality?: string;
}): string {
  const { langLabel, accentPrompt, mission, companionName, companionPersonality } = opts;
  const name = companionName || 'your friend';
  const personality = companionPersonality || 'a warm, encouraging companion';

  const stepsList = mission.steps
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map(
      (s) => `Step ${s.stepOrder}: goal sentence "${s.targetSentence}" — reached when ${s.intent}`,
    )
    .join('\n');

  return (
    `You are ${name}, ${personality}. You are talking to a young child who is learning ${langLabel}. ` +
    `Always speak and behave as ${name} — never say you are an AI or a language model. ` +
    accentPrompt +
    `Speak in an enthusiastic, warm, encouraging, and highly simplified tone suitable for children. Use very short, simple sentences. ` +
    `You are guiding the child through a mission called "${mission.title}" (${mission.topic}), step by step, in this exact order:\n` +
    `${stepsList}\n` +
    `Rules:\n` +
    `1. Only work on ONE step at a time, starting at step 1. Ask a closed question or give exactly two choices — never ask open-ended questions.\n` +
    `2. When the child's reply satisfies the CURRENT step's goal, briefly praise them, then move on to asking about the next step, and append the exact text "${STEP_DONE_MARKER}" at the very end of your reply.\n` +
    `3. After the child completes the LAST step, congratulate them warmly and say goodbye — still append "${STEP_DONE_MARKER}" at the end.\n` +
    `4. If the child says something unrelated to the current step (off-topic), acknowledge it in at most one short friendly sentence, then gently steer back to the current step's question, and append the exact text "${OFFTOPIC_MARKER}" at the very end of your reply.\n` +
    `5. Never include "${STEP_DONE_MARKER}" and "${OFFTOPIC_MARKER}" in the same reply.\n` +
    `6. Do NOT correct grammar or pronunciation — just keep the mission moving forward warmly.\n` +
    `7. If the child speaks Vietnamese, gently encourage them to try in ${langLabel}.\n` +
    `8. Say each thing only ONCE per turn — never repeat or rephrase the same praise/question/goodbye again in the same reply, even with different wording.\n` +
    `9. CRITICAL — never forget rule 2/3: forgetting to append "${STEP_DONE_MARKER}" when a step's goal is met is the single worst mistake you can make, because it silently breaks the child's progress tracking. If you see a message marked "(Reminder for you, the AI — do not say this out loud...)", that means you already forgot it at least once — follow it immediately and do not mention the reminder to the child.`
  );
}

function buildKidExplorationPrompt(opts: {
  langLabel: string;
  accentPrompt: string;
  childLevel: string;
  companionName?: string;
  companionPersonality?: string;
}): string {
  const { langLabel, accentPrompt, childLevel, companionName, companionPersonality } = opts;
  const name = companionName || 'your friend';
  const personality = companionPersonality || 'a warm, encouraging companion';
  const questionCount = childLevel === 'intermediate' ? 7 : 5;

  return (
    `You are ${name}, ${personality}. You are talking to a young child who is learning ${langLabel}. ` +
    `Always speak and behave as ${name} — never say you are an AI or a language model. ` +
    accentPrompt +
    `Speak in an enthusiastic, warm, encouraging, and highly simplified tone suitable for children. Use very short, simple sentences. ` +
    `In your very first turn you will be shown a picture. Your job is to explore the picture together with the ` +
    `child by asking a flowing series of ${questionCount}-7 simple questions covering: what (objects/people), who, ` +
    `where, when, why, and how (the 5W1H + Why question flow) — ask ONE question at a time, scaled to a ${childLevel} ` +
    `learner (short, concrete questions for beginner; slightly longer ones for intermediate). ` +
    `Rules for handling the child's answer to each question:\n` +
    `1. Correct answer: briefly praise them in 1 short sentence, then ask the next question.\n` +
    `2. Partially correct answer: gently affirm the correct part, add the missing piece yourself, then move on.\n` +
    `3. Wrong answer: kindly say the correct answer yourself in 1 simple sentence, then move on — never make the child feel bad.\n` +
    `4. Silence (no answer): repeat the same question once, more simply, with an example.\n` +
    `5. Off-topic / unrelated answer: acknowledge it briefly and warmly, then gently repeat the current question.\n` +
    `6. Do NOT correct grammar or pronunciation — just keep the activity moving forward warmly.\n` +
    `7. After the last question, congratulate the child warmly and say goodbye.\n` +
    `8. If the child speaks Vietnamese, gently encourage them to try in ${langLabel}.\n` +
    `9. Say each thing only ONCE per turn — never repeat or rephrase the same praise/question/goodbye again in the same reply, even with different wording.`
  );
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user } = await verifyUser(req);

    const {
      language_id = 'en',
      topic = '',
      voice_id,
      speaking_style = 'casual',
      conversation_method = 'free_talk',
      accent = 'en-US',
      mode,
      mission,
      companion_name,
      companion_personality,
      child_level = 'beginner',
    } = await req.json().catch(() => ({}));
    const voice = voice_id ?? VOICE_BY_LANG[language_id] ?? 'Kore';

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    const now = new Date();
    const expireTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    // newSessionExpireTime: max lifetime for a live session = 15 min (Gemini Live cap)
    const newSessionExpireTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const langLabel = language_id === 'ja' ? 'Japanese' : 'English';

    let accentPrompt = '';
    if (language_id === 'en') {
      if (accent === 'en-UK') {
        accentPrompt =
          'You must speak with a British English accent (en-UK), using British pronunciation, spelling, and vocabulary. ';
      } else {
        accentPrompt =
          'You must speak with an American English accent (en-US), using American pronunciation, spelling, and vocabulary. ';
      }
    }

    let systemInstruction: string;

    if (mode === 'kid_guided' && mission) {
      systemInstruction = buildKidGuidedPrompt({
        langLabel,
        accentPrompt,
        mission,
        companionName: companion_name,
        companionPersonality: companion_personality,
      });
    } else if (mode === 'kid_exploration') {
      systemInstruction = buildKidExplorationPrompt({
        langLabel,
        accentPrompt,
        childLevel: child_level,
        companionName: companion_name,
        companionPersonality: companion_personality,
      });
    } else {
      const topicLine = topic
        ? `The topic of conversation is: ${topic}.`
        : 'You may talk about any everyday topic.';

      const stylePrompt = STYLE_PROMPTS[speaking_style] || STYLE_PROMPTS.casual;
      const methodPrompt = METHOD_PROMPTS[conversation_method] || METHOD_PROMPTS.free_talk;

      systemInstruction =
        `You are a friendly ${langLabel} conversation partner helping a Vietnamese learner practice spoken ${langLabel}. ` +
        accentPrompt +
        `Your speaking style: ${stylePrompt} ` +
        `Your conversational approach: ${methodPrompt} ` +
        `${topicLine} ` +
        `Speak naturally as a real person would — keep sentences short and conversational. ` +
        `Do NOT correct grammar or pronunciation mistakes during the conversation. ` +
        `Just respond naturally and keep the conversation flowing. ` +
        `If the user speaks Vietnamese, gently encourage them to try in ${langLabel}.`;
    }

    // Mint ephemeral token — minimal request (constraints removed from API)
    // Model + config sẽ được gửi qua WebSocket setup message phía client
    const tokenResp = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
        }),
      },
    );

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      throw new Error(`Gemini auth_tokens error: ${errText}`);
    }

    const tokenData = await tokenResp.json();
    const tokenName: string = tokenData.name;
    if (!tokenName) throw new Error('No token returned from Gemini');

    console.log(`[live-token] user=${user.id} lang=${language_id} expire=${expireTime}`);

    // Trả thêm voice + systemInstruction để client dùng trong WebSocket setup
    return Response.json(
      {
        token: tokenName,
        model: LIVE_MODEL,
        expire_time: expireTime,
        voice,
        system_instruction: systemInstruction,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error('[live-token]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
