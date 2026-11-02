import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const html=readFileSync('public/cormyr/index.html','utf8');
const script=readFileSync('public/cormyr/campaign-time.js','utf8');
const route=readFileSync('src/routes/api/public/time.ts','utf8');
const migration=readFileSync('drizzle/migrations/0061_public_campaign_time_projection.sql','utf8');

test('Atlas público possui referência viva e não fixa em 1522 CV',()=>{
 assert.match(html,/id="public-campaign-current-time"/);
 assert.match(html,/src="campaign-time.js" defer/);
 assert.doesNotMatch(html,/<strong>1522 CV<\/strong>/);
 assert.doesNotMatch(html,/<strong>1522<\/strong>/); // não exibir ano fixo no lugar da data oficial
});
test('Atlas usa apenas endpoint público, sem token persistido e sem credenciais',()=>{
 assert.match(script,/fetch\('\/api\/public\/time'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/(localStorage|service_role|Bearer|supabase\.co)/);
 assert.match(script,/document\.hidden/);
 assert.match(script,/no-store/);
});
test('projeção é whitelist mínima com RLS privada preservada',()=>{
 assert.match(route,/get_public_campaign_time/);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.get_public_campaign_time/);
 assert.match(migration,/TO anon,authenticated/);
 assert.doesNotMatch(migration,/GRANT SELECT ON public\.campaign_calendar TO anon/);
 for(const privateName of ['published_week','last_round','updated_by','house_sheets','letter_replies'])
  assert.doesNotMatch(migration,new RegExp('\\x27'+privateName+'\\x27'));
});
