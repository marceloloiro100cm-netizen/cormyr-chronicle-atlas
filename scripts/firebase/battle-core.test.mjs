import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from './battle-core.mjs';

const nar={role:'narrador',uid:'n',memberHouseIds:new Set(),editHouseIds:new Set()};
const alice={role:'jogador',uid:'a',memberHouseIds:new Set(['hA']),editHouseIds:new Set(['hA'])};
const viewer={role:'jogador',uid:'v',memberHouseIds:new Set(['hA']),editHouseIds:new Set()};
const code=fn=>{try{fn();}catch(e){return e.code;}return null;};
const st=(n,extra={})=>({rulesVersion:'PTE-2.0',phase:n===0?'ready':'active',n,...extra});
function chain(len){
  const initial=st(0);const ih=c.battleHash(initial);let prev=ih,cur=initial,ch=ih;
  const receipts=[];
  for(let i=1;i<=len;i++){cur=st(i);const h=c.battleHash(cur);
    receipts.push({actionSeq:i,commandId:'cmd-'+i,prevHash:prev,stateHash:h,command:{type:'X',i}});prev=h;ch=h;}
  return {initial,current:cur,initialHash:ih,currentHash:ch,receipts};
}
let n=0;const newId=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;

test('canonical json sorts keys, drops undefined and rejects unsafe numbers',()=>{
  assert.equal(c.canonicalJson({b:1,a:[2,{z:1,y:undefined}]}),'{"a":[2,{"z":1}],"b":1}');
  assert.equal(c.canonicalJson(1.5),'1.5');
  assert.equal(code(()=>c.canonicalJson(1.3)),'invalid');
  assert.equal(c.battleHash({a:1}),c.battleHash({a:1}));
});
test('commitReplay validates chain, narrator only',()=>{
  const ch=chain(3);
  const r=c.commitReplay({actor:nar,name:' Teste ',...ch,newId});
  assert.equal(r.events.length,3);assert.equal(r.session.stateVersion,3);assert.equal(r.session.name,'Teste');
  assert.equal(r.session.status,'active');
  assert.equal(code(()=>c.commitReplay({actor:alice,name:'x',...ch,newId})),'denied');
  const broken=chain(3);broken.receipts[1].prevHash='0'.repeat(64);
  assert.equal(code(()=>c.commitReplay({actor:nar,name:'x',...broken,newId})),'invalid');
  assert.equal(code(()=>c.commitReplay({actor:nar,name:'x',...ch,currentHash:'1'.repeat(64),newId})),'invalid');
  const badCmd=chain(2);badCmd.receipts[0].commandId='cmd-9';
  assert.equal(code(()=>c.commitReplay({actor:nar,name:'x',...badCmd,newId})),'invalid');
  assert.equal(code(()=>c.commitReplay({actor:nar,name:'',...ch,newId})),'invalid');
  assert.equal(code(()=>c.commitReplay({actor:nar,name:'x',...ch,initial:{...ch.initial,phase:'active'},newId})),'invalid');
});
function session(ch,extra={}){return {id:'s1',status:'active',stateVersion:ch.receipts.length,stateHash:ch.currentHash,...extra};}
test('commitStep: CAS, duplicate and limits',()=>{
  const ch=chain(2);const s=session(ch);
  const next=st(3);const h=c.battleHash(next);
  const receipt={actionSeq:3,commandId:'cmd-3',prevHash:s.stateHash,stateHash:h,command:{type:'Y'}};
  const args={actor:nar,session:s,duplicate:null,expected:2,commandId:'command-3',command:{type:'Y'},receipt,current:next,prevHash:s.stateHash,stateHash:h};
  const ok=c.commitStep(args);
  assert.equal(ok.result.stateVersion,3);assert.equal(ok.event.seq,3);assert.equal(ok.session.stateHash,h);
  assert.equal(code(()=>c.commitStep({...args,expected:1})),'conflict');
  assert.equal(code(()=>c.commitStep({...args,session:{...s,stateHash:'2'.repeat(64)}})),'conflict');
  assert.equal(code(()=>c.commitStep({...args,session:{...s,status:'completed'}})),'invalid');
  assert.equal(code(()=>c.commitStep({...args,receipt:{...receipt,actionSeq:5}})),'invalid');
  assert.equal(code(()=>c.commitStep({...args,actor:alice})),'denied');
  const dup={seq:3,commandJson:JSON.stringify({type:'Y'}),eventJson:JSON.stringify(receipt)};
  const d=c.commitStep({...args,duplicate:dup});
  assert.equal(d.duplicate,true);assert.deepEqual(d.result.receipt,receipt);
  assert.equal(code(()=>c.commitStep({...args,duplicate:{...dup,commandJson:JSON.stringify({type:'Z'})}})),'conflict');
  const full={...s,stateVersion:1200};
  assert.equal(code(()=>c.commitStep({...args,session:full,expected:1200,receipt:{...receipt,actionSeq:1201}})),'invalid');
});
test('assemble and integrity',()=>{
  const ch=chain(2);const r=c.commitReplay({actor:nar,name:'x',...ch,newId});
  const file=c.assembleReplay({actor:nar,session:r.session,initial:r.states[0],events:[...r.events].reverse()});
  assert.equal(file.commands.length,2);assert.equal(file.commands[0].actionSeq,1);
  assert.equal(code(()=>c.assembleReplay({actor:alice,session:r.session,initial:r.states[0],events:[]})),'denied');
  c.checkSavedIntegrity({session:r.session,current:r.states[1],verifiedState:ch.current});
  assert.equal(code(()=>c.checkSavedIntegrity({session:r.session,current:r.states[1],verifiedState:st(99)})),'invalid');
});
test('planSavedCommand blocks AI control and stale versions',()=>{
  const state={rulesVersion:'PTE-2.0',phase:'active',activeUnitId:'u1',stacks:[{id:'u1',side:'attacker'}],controls:{attacker:'human'}};
  const s={id:'s1',stateVersion:0,stateHash:c.battleHash(state),status:'active'};
  const cur={json:JSON.stringify(state)};
  const cid='11111111-1111-4111-8111-111111111111';
  const apply=(x,cmd)=>({...x,seen:cmd.type});
  const p=c.planSavedCommand({actor:nar,session:s,current:cur,duplicate:null,expectedVersion:0,commandId:cid,command:{type:'MOVE'},applyCommand:apply});
  assert.equal(p.commitArgs.receipt.actionSeq,1);assert.equal(p.commitArgs.receipt.commandId,'cmd-1');
  assert.equal(p.commitArgs.receipt.prevHash,s.stateHash);
  const ai={...state,controls:{attacker:'ai'}};
  assert.equal(code(()=>c.planSavedCommand({actor:nar,session:{...s,stateHash:c.battleHash(ai)},current:{json:JSON.stringify(ai)},duplicate:null,expectedVersion:0,commandId:cid,command:{type:'MOVE'},applyCommand:apply})),'denied');
  assert.equal(c.planSavedCommand({actor:nar,session:{...s,stateHash:c.battleHash(ai)},current:{json:JSON.stringify(ai)},duplicate:null,expectedVersion:0,commandId:cid,command:{type:'MANUAL_FINISH'},applyCommand:apply}).duplicate,false);
  assert.equal(code(()=>c.planSavedCommand({actor:nar,session:s,current:cur,duplicate:null,expectedVersion:1,commandId:cid,command:{type:'MOVE'},applyCommand:apply})),'conflict');
  assert.equal(code(()=>c.planSavedCommand({actor:nar,session:s,current:{json:JSON.stringify({...state,x:1})},duplicate:null,expectedVersion:0,commandId:cid,command:{type:'MOVE'},applyCommand:apply})),'invalid');
  assert.equal(code(()=>c.planSavedCommand({actor:nar,session:s,current:cur,duplicate:null,expectedVersion:0,commandId:'bad',command:{type:'MOVE'},applyCommand:apply})),'invalid');
  assert.equal(code(()=>c.planSavedCommand({actor:alice,session:s,current:cur,duplicate:null,expectedVersion:0,commandId:cid,command:{type:'MOVE'},applyCommand:apply})),'denied');
  const dup=c.planSavedCommand({actor:nar,session:s,current:cur,duplicate:{commandJson:JSON.stringify({type:'MOVE'}),eventJson:JSON.stringify({a:1})},expectedVersion:0,commandId:cid,command:{type:'MOVE'},applyCommand:apply});
  assert.equal(dup.duplicate,true);
});
const game=(over={})=>({battle:{phase:'active',activeUnitId:'u1',stacks:[{id:'u1',side:'attacker',source:{kind:'fictional'}}]},setup:{opponent:'human'},steps:[],...over});
test('live matches: create, visibility, canPlay and play rules',()=>{
  const rep={finalHash:'a'.repeat(64)};
  const m=c.createLive({actor:nar,title:'Batalha 1',attackerHouseId:'hA',defenderHouseId:'hB',housesActive:{hA:true,hB:true},replay:rep,newId}).match;
  assert.equal(m.stateVersion,0);assert.equal(m.status,'active');
  assert.equal(code(()=>c.createLive({actor:alice,title:'Batalha 1',attackerHouseId:'hA',defenderHouseId:'hB',housesActive:{hA:true,hB:true},replay:rep,newId})),'denied');
  assert.equal(code(()=>c.createLive({actor:nar,title:'Batalha 1',attackerHouseId:'hA',defenderHouseId:'hA',housesActive:{hA:true},replay:rep,newId})),'invalid');
  assert.equal(code(()=>c.createLive({actor:nar,title:'Batalha 1',attackerHouseId:'hA',defenderHouseId:'hB',housesActive:{hA:true,hB:false},replay:rep,newId})),'invalid');
  assert.equal(code(()=>c.createLive({actor:nar,title:'curt',attackerHouseId:'hA',defenderHouseId:'hB',housesActive:{hA:true,hB:true},replay:rep,newId})),'invalid');
  const g=game();const match={...m,stateHash:c.battleHash(g)};
  assert.equal(c.listLive({actor:alice,matches:[match]}).length,1);
  assert.equal(c.listLive({actor:{...alice,memberHouseIds:new Set(['zz'])},matches:[match]}).length,0);
  assert.equal(c.liveView({actor:alice,match,game:g}).canPlay,true);
  assert.equal(c.liveView({actor:viewer,match,game:g}).canPlay,false);
  assert.equal(code(()=>c.liveView({actor:{...alice,memberHouseIds:new Set(),editHouseIds:new Set()},match,game:g})),'not_found');
  assert.equal(code(()=>c.liveView({actor:alice,match:{...match,stateHash:'b'.repeat(64)},game:g})),'invalid');
  const applyStep=(x)=>({...x,steps:[...x.steps,{}]});
  const capture=x=>({finalHash:c.battleHash(x)});
  const out=c.playLive({actor:alice,match,game:g,expectedVersion:0,step:{type:'COMMAND',actor:'narrator',command:{type:'MOVE'}},applyStep,capture});
  assert.equal(out.match.stateVersion,1);assert.equal(out.match.status,'active');
  assert.equal(code(()=>c.playLive({actor:alice,match,game:g,expectedVersion:1,step:{type:'COMMAND',command:{type:'MOVE'}},applyStep,capture})),'conflict');
  assert.equal(code(()=>c.playLive({actor:viewer,match,game:g,expectedVersion:0,step:{type:'COMMAND',command:{type:'MOVE'}},applyStep,capture})),'denied');
  assert.equal(code(()=>c.playLive({actor:alice,match,game:g,expectedVersion:0,step:{type:'AI'},applyStep,capture})),'denied');
  assert.equal(code(()=>c.playLive({actor:alice,match,game:g,expectedVersion:0,step:{type:'COMMAND',actor:'narrator',command:{type:'MANUAL_FINISH'}},applyStep,capture})),'denied');
  assert.equal(c.playLive({actor:nar,match,game:g,expectedVersion:0,step:{type:'COMMAND',actor:'narrator',command:{type:'MANUAL_FINISH'}},applyStep,capture}).match.stateVersion,1);
  assert.equal(code(()=>c.playLive({actor:alice,match:{...match,status:'completed'},game:g,expectedVersion:0,step:{type:'COMMAND',command:{type:'MOVE'}},applyStep,capture})),'invalid');
  assert.equal(code(()=>c.playLive({actor:alice,match,game:g,expectedVersion:0,step:{type:'COMMAND',actor:'narrator',command:{type:'MOVE'}},applyStep:x=>x,capture})),'invalid');
  const done=c.playLive({actor:nar,match,game:g,expectedVersion:0,step:{type:'COMMAND',actor:'narrator',command:{type:'MOVE'}},
    applyStep:x=>({...x,battle:{...x.battle,phase:'completed'},steps:[...x.steps,{}]}),capture});
  assert.equal(done.match.status,'completed');
});
test('invitations: narrator creates, players read only open ones of their houses',()=>{
  const input={title:'Convocação X',houseId:'hA',scenario:'plain-open',attackerHouseId:'ashkar-model',defenderHouseId:'evenhand-model',
    attackerCommander:'ranger',defenderCommander:'knight'};
  const r=c.createInvitation({actor:nar,input,houseActive:true,newId});
  assert.equal(r.doc.status,'open');
  assert.equal(code(()=>c.createInvitation({actor:alice,input,houseActive:true,newId})),'denied');
  assert.equal(code(()=>c.createInvitation({actor:nar,input,houseActive:false,newId})),'invalid');
  assert.equal(code(()=>c.createInvitation({actor:nar,input:{...input,scenario:'x'},houseActive:true,newId})),'invalid');
  assert.equal(code(()=>c.createInvitation({actor:nar,input:{...input,attackerCommander:'x'},houseActive:true,newId})),'invalid');
  const other={...r.doc,id:'2',targetHouseId:'hZ'},closed={...r.doc,id:'3',status:'closed'};
  assert.deepEqual(c.listInvitations({actor:alice,invitations:[r.doc,other,closed]}).map(i=>i.id),[r.doc.id]);
  assert.equal(c.listInvitations({actor:nar,invitations:[r.doc,other,closed]}).length,2);
  assert.equal(c.closeInvitation({actor:nar,invitation:r.doc}).status,'closed');
  assert.equal(code(()=>c.closeInvitation({actor:nar,invitation:null})),'not_found');
  assert.equal(code(()=>c.closeInvitation({actor:alice,invitation:r.doc})),'denied');
});
test('D&D stores are narrator-only with the SQL constraints',()=>{
  assert.equal(c.dndSave({actor:nar,battleId:'dnd-training-1',replay:'{"a":1}',report:{x:1}}).reportJson,'{"x":1}');
  assert.equal(code(()=>c.dndSave({actor:alice,battleId:'b',replay:'x'})),'denied');
  assert.equal(code(()=>c.dndSave({actor:nar,battleId:'b',replay:''})),'invalid');
  assert.equal(c.dndSessionDocId('o','b'),c.dndSessionDocId('o','b'));
  assert.notEqual(c.dndSessionDocId('o','b'),c.dndSessionDocId('o2','b'));
  assert.equal(code(()=>c.dndLoad({actor:nar,battleId:'bad id',session:null})),'invalid');
  assert.equal(code(()=>c.dndLoad({actor:nar,battleId:'dnd-training-1',session:null})),'not_found');
  assert.equal(code(()=>c.dndLoad({actor:nar,battleId:'dnd-training-1',session:{ownerId:'other',replay:'x'}})),'not_found');
  assert.equal(c.dndLoad({actor:nar,battleId:'dnd-training-1',session:{ownerId:'n',replay:'x'}}).replay,'x');
  assert.equal(code(()=>c.dndSaveCustom({actor:nar,payload:{id:'goblin'}})),'invalid');
  assert.equal(c.dndSaveCustom({actor:nar,payload:{id:'custom-a',x:1}}).catalogVersion,2);
  assert.equal(code(()=>c.dndSaveCustom({actor:alice,payload:{id:'custom-a'}})),'denied');
  assert.equal(code(()=>c.dndDeleteCustom({actor:nar,id:'goblin'})),'invalid');
  assert.equal(code(()=>c.dndListCustom({actor:nar,items:[{id:'custom-a',payloadJson:'{"id":"custom-b"}'}]})),'invalid');
  assert.equal(code(()=>c.dndListCustom({actor:nar,items:Array.from({length:201},(_,i)=>({id:'custom-'+i,payloadJson:'{}'}))})),'invalid');
  assert.equal(code(()=>c.dndSaveOverride({actor:nar,monsterId:'Bad Id',patch:{}})),'invalid');
  assert.equal(code(()=>c.dndSaveOverride({actor:nar,monsterId:'orc',patch:[]})),'invalid');
  assert.equal(code(()=>c.dndRequireMonster(false)),'invalid');
  assert.equal(code(()=>c.dndCatalog({actor:alice,monsters:[]})),'denied');
  assert.equal(code(()=>c.dndVerified({actor:alice,rows:[]})),'denied');
  const rows=[{houseId:'h',sourceRow:2,sourceKey:'b'},{houseId:'h',sourceRow:1,sourceKey:'a'},{houseId:'x',sourceRow:1,sourceKey:'c'}];
  assert.deepEqual(c.rosterFor({actor:nar,houseId:'h',rows}).map(r=>r.source_key),['a','b']);
  assert.equal(code(()=>c.rosterFor({actor:alice,houseId:'h',rows})),'denied');
});
test('saved session list is narrator-only and newest first',()=>{
  const l=c.listSaved({actor:nar,sessions:[{id:'1',updatedAt:'2026-01-01'},{id:'2',updatedAt:'2026-02-01'}]});
  assert.deepEqual(l.map(s=>s.id),['2','1']);
  assert.equal(code(()=>c.listSaved({actor:alice,sessions:[]})),'denied');
});
