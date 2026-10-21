
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type AdminContext = {
  userId: string;
  supabase: SupabaseClient;
};

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AdminContext | null> {
  const authorization = req.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    res.status(500).json({ error: 'Supabase server configuration missing' });
    return null;
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    res.status(500).json({ error: 'Could not verify permissions' });
    return null;
  }

  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' });
    return null;
  }

  return { userId: userData.user.id, supabase };
}
