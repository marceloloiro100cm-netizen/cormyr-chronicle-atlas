import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolvePublicSupabase,PUBLIC_SUPABASE_URL,
 PUBLIC_SUPABASE_PUBLISHABLE_KEY} from '@/integrations/supabase/public-config';
import {publicCampaignTimeProjection} from '@/lib/calendar/public-time';
const source=(path:string)=>readFileSync(path,'utf8');
describe('CORMYR produção: calendário de login e configurações públicas',()=>{
 it('fallback de ambiente usa somente chave publicável e admite override no servidor',()=>{
  expect(resolvePublicSupabase()).toEqual({
   url:PUBLIC_SUPABASE_URL,key:PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  expect(PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[\w.-]+\.supabase\.co$/);
  expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/);
  expect(resolvePublicSupabase('  https://example.test  ','  public-test  '))
   .toEqual({url:'https://example.test',key:'public-test'});
  expect(resolvePublicSupabase('  ',null)).toEqual(resolvePublicSupabase());
  const publicConfig=source('src/integrations/supabase/public-config.ts');
  expect(publicConfig).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
  expect(publicConfig).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
 });
 it('somente a visualização pré-login usa a projeção pública e omite cookies',()=>{
  const shell=source('src/components/campaign-shell.tsx');
  const publicClock=shell.split('function PublicClock()')[1]!.split('export function CampaignShell')[0]!;
  expect(publicClock).toContain("fetch('/api/public/time'");
  expect(publicClock).toContain("credentials:'omit'");
  expect(publicClock).toContain('publicCampaignTimeProjection');
  expect(publicClock).not.toContain('get_campaign_calendar');
  expect(publicClock).not.toContain('useCampaignCalendarRealtime');
  expect(shell).toContain('publicTime?<PublicClock/>:<PrivateClock/>');
  expect(source('src/routes/auth.tsx')).toContain('<CampaignShell publicTime>');
  expect(source('src/routes/reset-password.tsx')).toContain('<CampaignShell publicTime>');
  expect(source('src/routes/[.]lovable.oauth.consent.tsx')).toContain('<CampaignShell publicTime>');
 });
 it('o painel autenticado preserva apenas o RPC e Realtime autorizados',()=>{
  const shell=source('src/components/campaign-shell.tsx');
  const privateClock=shell.split('function PrivateClock()')[1]!.split('function PublicClock()')[0]!;
  expect(privateClock).toContain('useCampaignTime()');
  expect(privateClock).toContain('useCampaignCalendarRealtime()');
  expect(source('src/lib/calendar/campaign-time.ts')).toContain("supabase.rpc('get_campaign_calendar')");
  expect(source('src/routes/_authenticated/jogadores.tsx')).toContain('<CampaignShell>');
 });
 it('a API pública mantém apenas cinco campos e ignora identidade do visitante',()=>{
  const endpoint=source('src/routes/api/public/time.ts');
  expect(endpoint).toContain('resolvePublicSupabase');
  expect(endpoint).toContain("db.rpc('get_public_campaign_time')");
  expect(endpoint).toContain('publicCampaignTimeProjection(data)');
  expect(endpoint).not.toContain('service_role');
  const value=publicCampaignTimeProjection({year:1522,month:9,day:11,
   festival:null,version:2,private_note:'never show',updated_by:'private'});
  expect(Object.keys(value).sort()).toEqual([
   'date','day','festival','label','month','period','version','year'].sort());
  expect(JSON.stringify(value)).not.toContain('private_note');
 });
 it('endpoints e middleware usam fallback publicável, mantendo autorização privada',()=>{
  const protectedAuth=source('src/integrations/supabase/auth-middleware.ts');
  expect(protectedAuth).toContain('resolvePublicSupabase');
  expect(protectedAuth).toContain('getClaims(token)');
  const server=source('src/integrations/supabase/client.server.ts');
  expect(server).toContain("process.env['SUPABASE_SERVICE_ROLE_KEY']");
  expect(server).not.toContain('PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const privateGM=source('src/routes/api/public/gm-content.ts');
  expect(privateGM).toContain('is_campaign_admin');
  expect(privateGM).toContain('campaign_private_gm_content');
 });
});