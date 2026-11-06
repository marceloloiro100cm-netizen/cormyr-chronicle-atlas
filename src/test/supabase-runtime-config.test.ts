import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
describe('Public Supabase config supports production without tracked .env',()=>{
 it('does not use an unguarded process global in the browser',()=>{
  const source=readFileSync(resolve('src/integrations/supabase/client.ts'),'utf8');
  expect(source).toContain("typeof process === 'undefined'");
  expect(source).toContain('PUBLIC_SUPABASE_URL');
  expect(source).toContain('PUBLIC_SUPABASE_PUBLISHABLE_KEY');
 });
 it('never contains a server credential or a user identity',()=>{
  const source=readFileSync(resolve('src/integrations/supabase/public-config.ts'),'utf8');
  expect(source).not.toContain('SERVICE_ROLE_KEY');
  expect(source).not.toMatch(/(?:password|senha)\s*[:=]\s*['"]/i);
  expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
 });
});
