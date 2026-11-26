import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(name,'utf8');
describe('Atlas público: entrada Firebase visível, sem ponte Supabase',()=>{
  it('mostra um link de entrada real e acessível no arquivo público',()=>{
    const html=read('public/cormyr/index.html');
    expect(html).toContain('<a id="login-button"');
    expect(html).toContain('href="/auth"');
    expect(html).toContain('Entrar no Conselho de Cormyr');
    // 21/11/2026: o site aberto saiu do modo manutenção. Calendário, catálogo
    // e traduções vêm das APIs públicas; se elas responderem erro, o acervo
    // estático continua como está (cada script ignora a falha).
    expect(html).not.toContain('CORMYR_ARCHIVE_ONLY');
    expect(html).not.toContain('aria-label="Conselho em manutenção"');
  });
  it('remove o token legado, chamadas do provedor antigo e autorização de administrador no browser',()=>{
    const extras=read('public/cormyr/extras.js');
    expect(extras).not.toContain('supabase.co');
    expect(extras).not.toContain('sb-');
    expect(extras).not.toContain('localStorage.getItem');
    expect(extras).not.toContain('is_campaign_admin');
    expect(extras).not.toContain("btn.href='/jogadores'");
    expect(extras).toContain('window.addEventListener');
  });
  it('homologação e bancada não orientam mais retorno ao provedor legado',()=>{
    const homolog=read('src/routes/firebase-homolog.tsx');
    const workbench=read('src/components/firebase/FirebaseDomainPreview.tsx');
    const config=read('src/integrations/firebase/public-config.ts');
    expect(homolog).toContain('Voltar ao portal Firebase do Atlas');
    expect(homolog).toContain('href="/auth"');
    expect(homolog).not.toContain('pelo Supabase');
    expect(workbench).toContain('não concede acesso à campanha');
    expect(workbench).not.toContain('login Supabase');
    expect(config).not.toContain('active Supabase authentication');
  });
  it('preserva bloqueios de rotas antigas e APIs mesmo abrindo login e recuperação',()=>{
    const root=read('src/routes/__root.tsx');
    const gate=read('src/lib/archive-only.ts');
    expect(root).toContain('shouldRedirectToFirebasePilot(location.pathname)');
    expect(root).toContain('isFirebasePilotPage(location.pathname)');
    expect(gate).toContain("pathname === '/reset-password'");
    expect(gate).toContain("pathname === '/auth'");
    expect(gate).toContain("return pathname === '/jogadores'");
    expect(gate).toContain('CORMYR_ARCHIVE_ONLY = true');
  });
});
