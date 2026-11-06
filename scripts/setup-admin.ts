import { createClient } from '@supabase/supabase-js';

// Verification-only administrative health check.
// NEVER creates users, changes e-mails, resets passwords or grants permissions.
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.ADMIN_SETUP_USER_ID;

if (!url || !serviceKey || !userId) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ADMIN_SETUP_USER_ID');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // The identifier comes from the hosting environment, never from public Git.
  const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId!);
  if (userError || !user?.user) throw new Error('Existing Narrator account not found.');

  const [player, role] = await Promise.all([
    supabaseAdmin.from('campaign_players').select('id,active').eq('user_id', userId!).maybeSingle(),
    supabaseAdmin.from('user_roles').select('role').eq('user_id', userId!).eq('role', 'admin').maybeSingle(),
  ]);
  if (player.error || !player.data?.active) throw new Error('Narrator campaign membership is absent or inactive.');
  if (role.error || role.data?.role !== 'admin') throw new Error('Narrator administrator role is absent.');
  console.log('Narrator permissions verified. No account details or credentials were modified.');
}

main().catch(() => {
  // Avoid echoing provider error payloads that could contain account metadata.
  console.error('Narrator verification failed; no changes were made.');
  process.exitCode = 1;
});
