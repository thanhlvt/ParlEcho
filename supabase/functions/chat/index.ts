import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface ChatRequest {
  conversation_id: string;
  message: string;
  language_id: 'en' | 'ja';
  mode?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface ChatResponse {
  reply: string;
  translation: string;
  furigana?: string;
  romaji?: string;
  corrections: Array<{ original: string; fixed: string; explanation: string }>;
  hints: string[];
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { user, supabase } = await verifyUser(req);
    const body: ChatRequest = await req.json();
    const { conversation_id, message, language_id, mode = 'roleplay', history = [] } = body;

    // Verify conversation belongs to this user
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .single();

    if (convErr || !conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404, headers: corsHeaders });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

    // Call Claude
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: buildSystemPrompt(language_id, mode),
        messages: [
          ...history,
          { role: 'user', content: message },
        ],
      }),
    });

    if (!claudeResp.ok) {
      throw new Error(`Claude API error: ${await claudeResp.text()}`);
    }

    const claudeData = await claudeResp.json();
    const rawText: string = claudeData.content[0]?.text ?? '{}';

    let parsed: ChatResponse;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback nếu Claude không trả JSON thuần
      parsed = { reply: rawText, translation: '', corrections: [], hints: [] };
    }

    // Lấy sort_order tiếp theo
    const { data: last } = await supabase
      .from('messages')
      .select('sort_order')
      .eq('conversation_id', conversation_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (last?.sort_order ?? 0) + 1;

    // Lưu tin user + AI vào DB
    await supabase.from('messages').insert([
      {
        conversation_id,
        user_id: user.id,
        role: 'user',
        sort_order: nextOrder,
        text: message,
      },
      {
        conversation_id,
        user_id: user.id,
        role: 'assistant',
        sort_order: nextOrder + 1,
        text: parsed.reply,
        translation: parsed.translation ?? null,
        furigana: parsed.furigana ?? null,
        romaji: parsed.romaji ?? null,
        corrections: parsed.corrections ?? [],
        hints: parsed.hints ?? [],
      },
    ]);

    // Upsert daily_activity (conversations_count)
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAct } = await supabase
      .from('daily_activity')
      .select('id, conversations_count')
      .eq('user_id', user.id)
      .eq('activity_date', today)
      .maybeSingle();

    if (todayAct) {
      await supabase
        .from('daily_activity')
        .update({ conversations_count: todayAct.conversations_count + 1 })
        .eq('id', todayAct.id);
    } else {
      await supabase.from('daily_activity').insert({
        user_id: user.id,
        activity_date: today,
        conversations_count: 1,
      });
    }

    return Response.json(parsed, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});

function buildSystemPrompt(language: string, mode: string): string {
  const lang = language === 'ja' ? 'Japanese' : 'English';
  const jpExtra =
    language === 'ja'
      ? '"furigana": "hiragana reading of your reply", "romaji": "romaji of your reply",'
      : '';

  return `You are a ${lang} conversation partner helping a Vietnamese learner practice ${lang}.
Conversation mode: ${mode}.

Always respond with ONLY valid JSON — no markdown, no preamble, no trailing text:
{
  "reply": "your response in ${lang}",
  "translation": "Vietnamese translation of your reply",
  ${jpExtra}
  "corrections": [{"original": "exact user mistake", "fixed": "correct form", "explanation": "brief explanation in Vietnamese"}],
  "hints": ["one natural follow-up the user could say (in ${lang})"]
}

Rules:
- corrections: [] if the user made no mistakes.
- Keep replies natural, encouraging, appropriately short for conversation practice.
- Never break JSON structure.`;
}
