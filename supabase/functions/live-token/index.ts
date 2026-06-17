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
  beginner: 'Speak very slowly, clearly, and use simple vocabulary suitable for a beginner language learner.',
  children: 'Speak in an enthusiastic, warm, encouraging, and highly simplified tone suitable for children.',
};

const METHOD_PROMPTS: Record<string, string> = {
  free_talk: 'Maintain a natural, friendly, free-flowing conversation on various everyday topics.',
  consulting: 'Act as an empathetic advisor. Ask thoughtful questions, listen actively, and help the user think through their problems.',
  interview: 'Act as a professional interviewer. Ask structured questions one by one about the user\'s background, skills, and experience.',
  empathetic: 'Be exceptionally supportive, warm, and understanding. Focus on validating the user\'s feelings and thoughts.',
  pressure: 'Act as a tough challenger. Ask challenging follow-up questions, probe the user\'s arguments, and put moderate conversational pressure on them.',
};

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
    } = await req.json().catch(() => ({}));
    const voice = voice_id ?? VOICE_BY_LANG[language_id] ?? 'Kore';

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    const now = new Date();
    const expireTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    // newSessionExpireTime: max lifetime for a live session = 15 min (Gemini Live cap)
    const newSessionExpireTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const langLabel = language_id === 'ja' ? 'Japanese' : 'English';
    const topicLine = topic
      ? `The topic of conversation is: ${topic}.`
      : 'You may talk about any everyday topic.';

    const stylePrompt = STYLE_PROMPTS[speaking_style] || STYLE_PROMPTS.casual;
    const methodPrompt = METHOD_PROMPTS[conversation_method] || METHOD_PROMPTS.free_talk;

    let accentPrompt = '';
    if (language_id === 'en') {
      if (accent === 'en-UK') {
        accentPrompt = 'You must speak with a British English accent (en-UK), using British pronunciation, spelling, and vocabulary. ';
      } else {
        accentPrompt = 'You must speak with an American English accent (en-US), using American pronunciation, spelling, and vocabulary. ';
      }
    }

    const systemInstruction =
      `You are a friendly ${langLabel} conversation partner helping a Vietnamese learner practice spoken ${langLabel}. ` +
      accentPrompt +
      `Your speaking style: ${stylePrompt} ` +
      `Your conversational approach: ${methodPrompt} ` +
      `${topicLine} ` +
      `Speak naturally as a real person would — keep sentences short and conversational. ` +
      `Do NOT correct grammar or pronunciation mistakes during the conversation. ` +
      `Just respond naturally and keep the conversation flowing. ` +
      `If the user speaks Vietnamese, gently encourage them to try in ${langLabel}.`;

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
