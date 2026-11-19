import {describe,it,expect} from 'vitest';
import {projectWorkspaceMailContext,type WorkspaceMailTables}
  from './firebase-workspace-mail';

const fake=():WorkspaceMailTables=>({
 campaign_houses:[
  {id:'h1',name:'Casa Um',active:true,season:2,details:'SEGREDO H1'},
  {id:'h2',name:'Casa Dois',active:true,season:2,details:'SEGREDO H2'},
 ],
 campaign_players:[
  {id:'p1',user_id:'u1',name:'Um',roster_house_id:'h1',
   active:true,require_password_change:false},
  {id:'p2',user_id:'u2',name:'Dois',roster_house_id:'h2',
   active:true,require_password_change:false},
 ],
 house_memberships:[
  {player_id:'p1',house_id:'h1',can_edit:true},
  {player_id:'p2',house_id:'h2',can_edit:true},
 ],
 campaign_letters:[
  {id:'l1',sender_user_id:'u2',subject:'Carta autorizada',content:'CORPO 1',
   recipient_house_id:'h1',origin_house_id:'h2',
   created_at:'2026-11-19T00:00:00Z',publication_state:'delivered'},
  {id:'l2',sender_user_id:'u2',subject:'SEGREDO OUTRA CASA',content:'CORPO 2',
   recipient_house_id:'h2',origin_house_id:'h2',
   created_at:'2026-11-19T00:00:00Z',publication_state:'delivered'},
 ],
 letter_replies:[
  {id:'r1',letter_id:'l1',author_user_id:'u2',
   content:'RESPOSTA 1',created_at:'2026-11-19T00:00:00Z',
   publication_state:'delivered',recipient_user_id:'u1'},
  {id:'r2',letter_id:'l2',author_user_id:'u2',
   content:'RESPOSTA 2',created_at:'2026-11-19T00:00:00Z',
   publication_state:'delivered',recipient_user_id:'u2'},
 ],
 letter_receipts:[
  {letter_id:'l1',user_id:'u1',read_at:'2026-11-19T00:00:00Z'},
  {letter_id:'l2',user_id:'u2',read_at:'2026-11-19T00:00:00Z'},
 ],
 letter_rounds:[{number:3,status:'open'}],
});
describe('Council mail context remains scoped to current Firebase viewer',()=>{
 it('strips private texts, other House details and historical edit grants',()=>{
  const ctx=projectWorkspaceMailContext(fake(),{
   uid:'u1',profile:'jogador',playerId:'p1',memberHouseIds:['h1']});
  expect(ctx.letters.map(l=>l.id)).toEqual(['l1']);
  expect(ctx.replies.map(r=>r.id)).toEqual(['r1']);
  expect(ctx.receipts).toHaveLength(1);
  expect(ctx.members).toHaveLength(1);
  expect(ctx.members[0]?.can_edit).toBe(false);
  expect(ctx.players.find(p=>p.id==='p2')?.user_id).toBeNull();
  expect(ctx.houses.find(h=>h.id==='h2')?.details).toBe('');
  const json=JSON.stringify(ctx);
  for(const item of ['CORPO 1','CORPO 2','RESPOSTA 1','RESPOSTA 2',
   'SEGREDO H2','SEGREDO OUTRA CASA','"id":"l2"','"id":"r2"'])
   expect(json).not.toContain(item);
 });
 it('Narrator gets historical headers but no letter bodies',()=>{
  const ctx=projectWorkspaceMailContext(fake(),{
   uid:'gm',profile:'narrador',playerId:null,memberHouseIds:[]});
  expect(ctx.letters).toHaveLength(2);
  expect(ctx.replies).toHaveLength(2);
  expect(ctx.houses.find(h=>h.id==='h2')?.details).toBe('SEGREDO H2');
  expect(JSON.stringify(ctx)).not.toContain('CORPO 1');
 });
});
