import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const shell=read('src/components/campaign-shell.tsx');
test('public login header reads only public calendar data and sends no session',()=>{
 assert.match(shell,/fetch\('\/api\/public\/time'/);
 assert.match(shell,/credentials:'omit'/);
 assert.match(shell,/publicClock\?<PublicCampaignClock\/>:<PrivateCampaignClock\/>/);
 assert.match(shell,/useCampaignCalendarRealtime\(\)/);
});
test('unauthenticated routes do not call protected calendar RPC',()=>{
 for(const path of [
  'src/routes/auth.tsx',
  'src/routes/reset-password.tsx',
  'src/routes/[.]lovable.oauth.consent.tsx',
 ]){
  const source=read(path);
  assert.match(source,/<CampaignShell publicClock>/);
  assert.doesNotMatch(source,/get_campaign_calendar|useCampaignTime/);
 }
});
