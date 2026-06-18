import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Verify JWT từ Authorization header, trả về { user, supabase }.
 * supabase client dùng service_role key — bypass RLS, dùng cho mọi DB write trong function.
 * Không bao giờ tin user_id do client truyền trong body.
 */
export async function verifyUser(req: Request): Promise<{ user: User; supabase: SupabaseClient }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');

  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) throw new Error('Unauthorized');

  return { user, supabase };
}
