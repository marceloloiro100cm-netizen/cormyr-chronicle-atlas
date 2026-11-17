import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const page=readFileSync('src/routes/reset-password.tsx','utf8');
const auth=readFileSync('src/integrations/auth/firebase-rest-auth.ts','utf8');

describe('Redefinição de senha Firebase exclusiva',()=>{
  it('não faz mais escrita de senha pelo Supabase',()=>{
    expect(page).toContain('firebasePilotAuth');
    expect(page).toContain('auth.confirmPasswordReset(resetCode,password)');
    expect(page).not.toContain('supabase');
    expect(page).not.toContain('updateUser({password})');
    expect(page).toContain('<CampaignShell publicTime>');
  });
  it('somente aceita ação Firebase com código OOB e saneia a URL',()=>{
    expect(page).toContain("params.get('mode')==='resetPassword'");
    expect(page).toContain('RESET_CODE.test(code)');
    expect(page).toContain('window.history.replaceState');
    expect(page).toContain("name:'referrer',content:'no-referrer'");
    expect(auth).toContain('accounts:resetPassword');
    expect(auth).toContain('JSON.stringify({ oobCode, newPassword })');
    expect(page).not.toContain("location.hash.slice(1)");
  });
  it('encerra a sessão depois da troca e não publica detalhes do provedor',()=>{
    expect(page).toContain('auth.signOut()');
    expect(page).toContain('Solicite um novo link de recuperação.');
    expect(page).not.toContain('error.message');
    expect(page).not.toContain('console.log');
  });
});
