import {describe,it,expect} from 'vitest';
import {projectWorkspaceMailTables,runWorkspaceMailPage,validateWorkspaceMailInput,
 type WorkspaceMailTables} from '@/lib/mail/firebase-workspace-mail';

const N='gm',A='player-a-uid',B='player-b-uid';
const viewerA={uid:A,profile:'jogador' as const,playerId:'p-a',memberHouseIds:['house-a']};
const narrator={uid:N,profile:'narrador' as const,playerId:null,memberHouseIds:[]};
const letter=(id:string,over:Record<string,unknown>={})=>({
 id,sender_user_id:N,sender_player_id:null,sender_name:'Narrador',
 recipient_player_id:null,recipient_house_id:'house-a',origin_house_id:null,
 subject:'Assunto '+id,content:'Texto '+id,created_at:'2026-11-10T12:00:00Z',
 delivered_at:'2026-11-10T12:00:00Z',deleted_at:null,
 publication_state:'delivered',delivery_week:2,creation_week:2,
 letter_number:2,letter_kind:'reservada',court_member_id:null,
 court_assignment:null,military_unit_id:null,batch_key:null,...over,
});
const rows=():WorkspaceMailTables=>({
 campaign_players:[
  {id:'p-a',user_id:A,roster_house_id:'house-a',active:false,require_password_change:true},
  {id:'p-b',user_id:B,roster_house_id:'house-b',active:true,require_password_change:false},
 ],
 house_memberships:[
  {player_id:'p-a',house_id:'house-a'},
  {player_id:'p-a',house_id:'house-b'},
  {player_id:'p-b',house_id:'house-b'},
 ],
 campaign_houses:[{id:'house-a',name:'Ashkar'},{id:'house-b',name:'Fewmerry'}],
 campaign_letters:[
  letter('own-house'),
  letter('foreign',{recipient_house_id:'house-b'}),
  letter('to-gm',{sender_user_id:A,sender_player_id:'p-a',
   recipient_house_id:null,origin_house_id:'house-a',
   court_member_id:'marshal',military_unit_id:'unit-one'}),
  letter('draft',{publication_state:'draft'}),
 ],
 letter_replies:[{id:'reply-1',letter_id:'own-house',author_user_id:A,
  author_name:'Marshal',recipient_user_id:N,content:'Resposta',
  publication_state:'delivered',created_at:'2026-11-11T12:00:00Z',
  delivered_at:'2026-11-11T12:00:00Z',deleted_at:null,
  creation_week:2,delivery_week:2}],
 letter_receipts:[{letter_id:'own-house',user_id:A,read_at:'2026-11-12T12:00:00Z'}],
 letter_rounds:[{number:2,status:'open'}],
});
describe('real workspace mail original filters + live scope',()=>{
 it('reads actual source fields while applying current Firebase member scope',()=>{
  const data=rows();
  expect(projectWorkspaceMailTables(data,viewerA).memberships
   .filter(m=>m.player_id==='p-a').map(m=>m.house_id)).toEqual(['house-a']);
  const page=runWorkspaceMailPage(data,viewerA,{});
  expect(page.letters.map(l=>l.id).sort()).toEqual(['own-house','to-gm']);
  expect(page.replies.map(r=>r.id)).toEqual(['reply-1']);
  expect(runWorkspaceMailPage(data,viewerA,{filters:{unit:'house-a:unit-one'}})
   .letters.map(l=>l.id)).toEqual(['to-gm']);
  expect(runWorkspaceMailPage(data,viewerA,{filters:{court:'house-a:marshal'}})
   .letters.map(l=>l.id)).toEqual(['to-gm']);
  expect(runWorkspaceMailPage(data,viewerA,{filters:{text:'Resposta'}}).letters
   .map(l=>l.id)).toEqual(['own-house']);
 });
 it('Narrator sees every non-deleted original including drafts and receives to-GM mail',()=>{
  const data=rows();
  expect(runWorkspaceMailPage(data,narrator,{filters:{box:'recebidas'}})
   .letters.map(l=>l.id)).toEqual(['to-gm']);
  expect(runWorkspaceMailPage(data,narrator,{filters:{box:'rascunhos'}})
   .letters.map(l=>l.id)).toEqual(['draft']);
  expect(runWorkspaceMailPage(data,narrator,{}).total).toBe(4);
 });
 it('revoked scope, invalid actors and user-submitted flags never grant access',()=>{
  const data=rows();
  const revoked={...viewerA,memberHouseIds:[]};
  const page=runWorkspaceMailPage(data,revoked,{});
  expect(page.letters.map(l=>l.id)).toEqual(['to-gm']);
  // Editor-Chefe lê o que foi entregue, sem rascunhos nem Lixeira.
  const editor={uid:'u-editor',profile:'editor' as const,playerId:null,memberHouseIds:[]};
  const editorPage=runWorkspaceMailPage(data,editor,{});
  expect(editorPage.letters.every(l=>l.publication_state==='delivered'&&l.deleted_at===null)).toBe(true);
  expect(editorPage.letters.some(l=>l.id==='draft')).toBe(false);
  expect(()=>runWorkspaceMailPage(data,editor,{filters:{box:'lixeira'}})).toThrow();
  expect(()=>runWorkspaceMailPage(data,{...editor,playerId:'p1'},{})).toThrow();
  expect(()=>runWorkspaceMailPage(data,{...editor,memberHouseIds:['h1']},{})).toThrow();
  expect(()=>runWorkspaceMailPage(data,{...viewerA,playerId:'other'},{})).toThrow();
  expect(()=>validateWorkspaceMailInput({filters:{isAdmin:'true'}})).toThrow();
  expect(()=>validateWorkspaceMailInput({page:-1})).toThrow();
  expect(()=>validateWorkspaceMailInput({size:51})).toThrow();
  expect(()=>validateWorkspaceMailInput({filters:{group_house_ids:['x/'.repeat(90)]}})).toThrow();
 });
 it('lixeira and pagination reuse the original contracts, not a new filtering algorithm',()=>{
  const data=rows();
  data.campaign_letters.push(letter('deleted',{deleted_at:'2026-11-14T12:00:00Z',sender_user_id:A}));
  const trash=runWorkspaceMailPage(data,viewerA,{filters:{box:'lixeira'}});
  expect(trash.letters.map(l=>l.id)).toEqual(['deleted']);
  const result=runWorkspaceMailPage(data,narrator,{page:0,size:2});
  expect(result.total).toBe(4);
  expect(result.letters).toHaveLength(2);
 });
});
