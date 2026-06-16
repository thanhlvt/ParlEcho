import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

// Live API model — source: ai.google.dev/gemini-api/docs/live-api/get-started-websocket
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

// Giọng mặc định per ngôn ngữ (giống tts function)
const VOICE_BY_LANG: Record<string, string> = {
  en: 'Kore',
  ja: 'Kore',
};

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user } = await verifyUser(req);

    const { language_id = 'en', topic = '' } = await req.json().catch(() => ({}));
    const voice = VOICE_BY_LANG[language_id] ?? 'Kore';

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

    const systemInstruction =
      `You are a friendly ${langLabel} conversation partner helping a Vietnamese learner practice spoken ${langLabel}. ` +
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
