import { createClient } from '@supabase/supabase-js';

// This script should be run in a secure environment where SUPABASE_SERVICE_ROLE_KEY is available
// E.g.: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/setup-admin.ts

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qkdznngbkwodsbpkpoax.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud or provide it locally.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const email = 'marcelo5.2@hotmail.com';
  const password = 'marcelo';

  try {
    console.log(`Setting up admin account for ${email}...`);
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    let user = users.users.find((u) => u.email === email);

    if (!user) {
      console.log('User not found. Creating...');
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;
      user = created.user;
      console.log(`Created user with ID: ${user.id}`);
    } else {
      console.log(`User already exists (ID: ${user.id}). Updating password and confirming...`);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
      });
      if (updateError) throw updateError;
    }

    const { data: player, error: playerError } = await supabaseAdmin
      .from('campaign_players')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player && !playerError) {
      console.log('Adding user to campaign_players...');
      await supabaseAdmin.from('campaign_players').insert({
        name: 'Mestre Marcelo',
        user_id: user.id,
        active: true,
        require_password_change: false
      });
    } else if (playerError) {
      console.warn("Failed to check campaign_players:", playerError.message);
    }

    const { data: role, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!role) {
      console.log('Assigning admin role in user_roles...');
      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: user.id, role: 'admin' });
      if (insertRoleError) throw insertRoleError;
    } else {
      console.log('User already has admin role.');
    }

    console.log('Setup complete! You can now log in.');
  } catch (err: any) {
    console.error('Setup failed:', err.message || err);
  }
}

main();
