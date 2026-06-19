import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/auth.ts';

// Ngưỡng SafeSearch chấp nhận được — chỉ duyệt ảnh khi mọi mục đều rất khó xảy ra.
// Thang đo Google Vision: UNKNOWN, VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY.
const SAFE_LEVELS = new Set(['VERY_UNLIKELY', 'UNLIKELY']);

interface SafeSearchAnnotation {
  adult?: string;
  violence?: string;
  racy?: string;
  medical?: string;
  spoof?: string;
}

function isApproved(safeSearch: SafeSearchAnnotation): boolean {
  return (
    SAFE_LEVELS.has(safeSearch.adult ?? 'UNKNOWN') &&
    SAFE_LEVELS.has(safeSearch.violence ?? 'UNKNOWN') &&
    SAFE_LEVELS.has(safeSearch.racy ?? 'UNKNOWN')
  );
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

    // Reuse GOOGLE_GENAI_API_KEY — Cloud Vision API key trên cùng GCP project.
    const visionKey = Deno.env.get('GOOGLE_GENAI_API_KEY');
    if (!visionKey) throw new Error('GOOGLE_GENAI_API_KEY not configured');

    const visionResp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: 'SAFE_SEARCH_DETECTION' }],
            },
          ],
        }),
      },
    );

    if (!visionResp.ok) throw new Error(`Vision API error: ${await visionResp.text()}`);
    const visionData = await visionResp.json();
    const safeSearch: SafeSearchAnnotation = visionData.responses?.[0]?.safeSearchAnnotation ?? {};

    const approved = isApproved(safeSearch);

    await supabase
      .from('exploration_images')
      .update({ is_approved: approved, safesearch_result: safeSearch })
      .eq('id', exploration_image_id);

    console.log(`[image-moderation] image=${exploration_image_id} approved=${approved}`);

    return Response.json(
      { is_approved: approved, safesearch_result: safeSearch },
      {
        headers: corsHeaders,
      },
    );
  } catch (err) {
    console.error('[image-moderation]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
