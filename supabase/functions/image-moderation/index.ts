import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

interface ModerationResult {
  is_safe: boolean;
  reason: string;
}

// Dùng Gemini (đã có sẵn key cho chat/STT/Live, tránh phải enable + xin quyền
// riêng cho Cloud Vision API trên GCP) để đánh giá ảnh có phù hợp với trẻ em
// không, thay vì gọi Cloud Vision SafeSearch.
async function moderateWithGemini(
  imageBase64: string,
  geminiKey: string,
): Promise<ModerationResult> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
              {
                text:
                  `Đây là ảnh phụ huynh tải lên để dùng cho một nhiệm vụ học tiếng Anh/Nhật ` +
                  `của trẻ em (Image Exploration Mission). Hãy đánh giá ảnh có an toàn, phù hợp ` +
                  `để hiển thị cho trẻ em không (không khoả thân, không bạo lực/máu me, không ` +
                  `nội dung khiêu dâm/gợi dục, không hình ảnh đáng sợ/gây hoảng loạn cho trẻ nhỏ).\n` +
                  `Trả về DUY NHẤT JSON hợp lệ, không markdown, không giải thích thêm:\n` +
                  `{"is_safe": true, "reason": "lý do ngắn gọn bằng tiếng Việt"}`,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!resp.ok) throw new Error(`Gemini moderation error: ${await resp.text()}`);
  const data = await resp.json();
  const raw: string = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    return { is_safe: parsed.is_safe === true, reason: String(parsed.reason ?? '') };
  } catch {
    // Không parse được JSON → an toàn là chặn duyệt, không tự ý approve.
    return { is_safe: false, reason: 'Không đánh giá được nội dung ảnh.' };
  }
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { supabase } = await verifyUser(req);
    const { exploration_image_id } = await req.json();

    if (!exploration_image_id) throw new Error('Missing exploration_image_id');

    const { data: image, error: imageErr } = await supabase
      .from('exploration_images')
      .select('id, storage_path')
      .eq('id', exploration_image_id)
      .single();

    if (imageErr || !image) throw new Error('exploration_images row not found');

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from('exploration-images')
      .download(image.storage_path);

    if (dlErr || !fileBlob) throw new Error(`Cannot download image: ${dlErr?.message}`);

    const buffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const imageBase64 = btoa(binary);

    const geminiKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!geminiKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    const result = await moderateWithGemini(imageBase64, geminiKey);

    await supabase
      .from('exploration_images')
      .update({ is_approved: result.is_safe, safesearch_result: result })
      .eq('id', exploration_image_id);

    console.log(`[image-moderation] image=${exploration_image_id} approved=${result.is_safe}`);

    return Response.json(
      { is_approved: result.is_safe, safesearch_result: result },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error('[image-moderation]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
