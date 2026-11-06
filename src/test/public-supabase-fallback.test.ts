import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PUBLIC_SUPABASE_URL,PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 resolvePublicSupabase} from '@/integrations/supabase/public-config';

describe('Incidente 2026-11-06 — página pública sem VITE_* no build',()=>{
 it('mantém endereço e chave pública utilizáveis sem qualquer .env ou process.env',()=>{
  const result=resolvePublicSupabase(undefined,undefined);
  expect(result.url).toBe(PUBLIC_SUPABASE_URL);
  expect(result.key).toBe(PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  expect(result.url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  expect(result.key).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/);
  expect(result.key.startsWith('sb_secret_')).toBe(false);
 });
 it('respeita configuração explícita injetada na hospedagem',()=>{
  expect(resolvePublicSupabase('https://test.example','pub-test'))
   .toEqual({url:'https://test.example',key:'pub-test'});
  expect(resolvePublicSupabase('   ','')).toEqual(resolvePublicSupabase());
 });
 it('não publica chave service_role, dados de contas ou .env',()=>{
  const publicModule=readFileSync('src/integrations/supabase/public-config.ts','utf8');
  expect(publicModule).not.toMatch(/SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]{10,}/);
  const browserClient=readFileSync('src/integrations/supabase/client.ts','utf8');
  expect(browserClient).toContain('resolvePublicSupabase(');
  expect(browserClient).toContain("typeof process==='undefined'");
  const serverClient=readFileSync('src/integrations/supabase/client.server.ts','utf8');
  expect(serverClient).toContain("const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']");
 });
 it('protege endpoints autenticados com middleware e RLS existentes',()=>{
  const middleware=readFileSync('src/integrations/supabase/auth-middleware.ts','utf8');
  expect(middleware).toContain('resolvePublicSupabase(');
  expect(middleware).toContain('getClaims(token)');
  const content=readFileSync('src/routes/api/public/gm-content.ts','utf8');
  expect(content).toContain('is_campaign_admin');
  expect(content).toContain('campaign_private_gm_content');
 });
});
