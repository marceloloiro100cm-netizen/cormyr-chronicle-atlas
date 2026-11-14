/**
 * Pure persistence rules of the battle domain (port of SQL 0076 to 0084 and of
 * the server functions battle-session, v3/live, v3/invitations and the private
 * D&D bestiary stores). The game rules stay in the TypeScript engine: replay
 * verification and command application are injected by the service. This
 * module owns what the database and the server wrappers decided: who may do
 * what, hash chaining, compare-and-set versions, idempotent command ids,
 * limits and the narrator-only tables. No I/O.
 */
import {createHash} from 'node:crypto';
import {scopeOf,canEditHouse,canReadHouse} from './noble-house-core.mjs';

export class BattleError extends Error {
  constructor(code,message){super(message);this.name='BattleError';this.code=code;}
}
const fail=(code,m)=>{throw new BattleError(code,m);};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_STATE_BYTES=800000,MAX_COMMANDS=1200,MAX_LIVE_VERSION=1500;
export const MODEL_IDS=['evenhand-model','ashkar-model','phelles-model','stonecastle-model','torchwinter-model','grantass-model'];
export const COMMANDERS=['tillet','noble','knight','war-mage','purple-dragon','ranger','priest','engineer','quartermaster','ashkar-raider'];
export const SCENARIOS=['plain-open','contested-woods','border-hills','narrow-passage'];

/* ------------------------- canonical form and hash ------------------------- */

/** Same canonical JSON as src/lib/battle/domain/replay.ts, so hashes agree. */
export function canonicalJson(value){
  if(value===null)return 'null';
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value)&&!Number.isSafeInteger(value*2))
      throw new BattleError('invalid','Replay exige números seguros em passos de meio ponto.');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(typeof value==='object'){
    const entries=Object.entries(value).filter(([,v])=>v!==undefined)
      .sort(([a],[b])=>a<b?-1:a>b?1:0);
    return '{'+entries.map(([k,v])=>JSON.stringify(k)+':'+canonicalJson(v)).join(',')+'}';
  }
  throw new BattleError('invalid','Valor não serializável na batalha.');
}
export const battleHash=value=>createHash('sha256').update(canonicalJson(value),'utf8').digest('hex');
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');

/* --------------------------------- access ---------------------------------- */

export function battleScope(uid,raw){
  try{return scopeOf(uid,raw);}catch{fail('denied','Acesso negado');}
}
export const requireNarrator=(actor,msg='Acesso restrito ao Narrador.')=>{if(actor.role!=='narrador')fail('denied',msg);};
export const canControl=(actor,houseId)=>canEditHouse(actor,houseId);
const canSee=(actor,houseId)=>canReadHouse(actor,houseId);

/* ------------------------------ saved sessions ------------------------------ */

/** battle_sim_commit_replay: validates the whole chain and returns the documents to write. */
export function commitReplay({actor,name,initial,current,initialHash,currentHash,receipts,newId,now}){
  requireNarrator(actor,'Narrador não autorizado');
  if(typeof name!=='string'||name.trim().length<1||name.trim().length>120||!isObj(initial)||!isObj(current)||
     !Array.isArray(receipts)||initial.rulesVersion!=='PTE-2.0'||current.rulesVersion!=='PTE-2.0'||initial.phase!=='ready'||
     !['active','completed','archived'].includes(current.phase)||!HASH.test(initialHash||'')||!HASH.test(currentHash||'')||
     bytes(initial)>MAX_STATE_BYTES||bytes(current)>MAX_STATE_BYTES||bytes(receipts)>1500000)
    fail('invalid','Estado tático inválido');
  if(receipts.length>MAX_COMMANDS)fail('invalid','Limite de comandos excedido');
  const at=now||new Date().toISOString(),id=newId();
  let previous=initialHash;
  const events=receipts.map((e,idx)=>{
    const seq=idx+1;
    if(!isObj(e)||e.actionSeq!==seq||e.commandId!=='cmd-'+seq||e.prevHash!==previous||!HASH.test(e.stateHash||'')||!isObj(e.command))
      fail('invalid','Encadeamento de replay inválido');
    previous=e.stateHash;
    return {sessionId:id,seq,commandId:e.commandId,actorId:actor.uid,commandJson:JSON.stringify(e.command),
      eventJson:JSON.stringify(e),prevHash:e.prevHash,stateHash:e.stateHash,createdAt:at};
  });
  if(previous!==currentHash)fail('invalid','Hash final divergente');
  return {id,session:{id,createdBy:actor.uid,name:name.trim(),status:current.phase,rulesVersion:'PTE-2.0',schemaVersion:2,
    initialStateHash:initialHash,stateHash:currentHash,stateVersion:receipts.length,createdAt:at,updatedAt:at},
    states:[{id:'initial:'+id,sessionId:id,kind:'initial',json:JSON.stringify(initial)},
      {id:'current:'+id,sessionId:id,kind:'current',json:JSON.stringify(current)}],events};
}

/** battle_sim_commit_step: duplicate by command id, CAS on version and hash, ordered sequence. */
export function commitStep({actor,session,duplicate,expected,commandId,command,receipt,current,prevHash,stateHash,now}){
  requireNarrator(actor,'Narrador não autorizado');
  if(typeof commandId!=='string'||commandId.length<5||commandId.length>100||!isObj(command)||!isObj(receipt)||!isObj(current)||
     !HASH.test(prevHash||'')||!HASH.test(stateHash||'')||receipt.prevHash!==prevHash||receipt.stateHash!==stateHash||
     bytes(current)>MAX_STATE_BYTES)fail('invalid','Comando tático inválido');
  if(!session)fail('invalid','Sessão de batalha indisponível');
  if(duplicate){
    if(canonicalJson(JSON.parse(duplicate.commandJson))!==canonicalJson(command))
      fail('conflict','Chave de comando reutilizada com outro payload');
    return {duplicate:true,result:{duplicate:true,receipt:JSON.parse(duplicate.eventJson),stateVersion:duplicate.seq}};
  }
  if(session.stateVersion!==expected)fail('conflict','CONFLICT: state_version alterada');
  if(session.stateHash!==prevHash)fail('conflict','CONFLICT: state_hash alterado');
  if(!['ready','active'].includes(session.status))fail('invalid','Batalha encerrada');
  if(current.rulesVersion!=='PTE-2.0'||!['active','completed'].includes(current.phase))fail('invalid','Estado final inválido');
  const next=session.stateVersion+1;
  if(next>MAX_COMMANDS)fail('invalid','Limite de comandos excedido');
  if(receipt.actionSeq!==next)fail('invalid','Sequência inválida');
  const at=now||new Date().toISOString();
  return {duplicate:false,
    event:{sessionId:session.id,seq:next,commandId,actorId:actor.uid,commandJson:JSON.stringify(command),
      eventJson:JSON.stringify(receipt),prevHash,stateHash,createdAt:at},
    session:{...session,stateVersion:next,stateHash,status:current.phase,updatedAt:at},
    currentJson:JSON.stringify(current),
    result:{duplicate:false,receipt,stateVersion:next}};
}

export function listSaved({actor,sessions}){
  requireNarrator(actor,'Acesso ao módulo de batalhas salvas restrito ao Narrador.');
  return [...sessions].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,60)
    .map(s=>({id:s.id,name:s.name,status:s.status,stateVersion:s.stateVersion,updatedAt:s.updatedAt,rulesVersion:s.rulesVersion}));
}

/** Raw replay file rebuilt from the stored rows; the engine then verifies it. */
export function assembleReplay({actor,session,initial,events}){
  requireNarrator(actor,'Acesso ao módulo de batalhas salvas restrito ao Narrador.');
  if(!session||!initial)fail('invalid','Batalha indisponível.');
  const ordered=[...events].sort((a,b)=>a.seq-b.seq).slice(0,MAX_COMMANDS);
  return {format:'CCA-BATTLE-REPLAY-1',rulesVersion:'PTE-2.0',schemaVersion:2,initial:JSON.parse(initial.json),
    initialStateHash:session.initialStateHash,commands:ordered.map(e=>JSON.parse(e.eventJson)),finalStateHash:session.stateHash};
}
/** After the engine replays the file: stored hash and stored current state must match. */
export function checkSavedIntegrity({session,current,verifiedState}){
  if(battleHash(verifiedState)!==session.stateHash||canonicalJson(verifiedState)!==canonicalJson(JSON.parse(current.json)))
    fail('invalid','Integridade não confirmada: sessão salva divergente.');
}

/**
 * Server flow applySavedBattleCommand up to the engine call. `applyCommand`
 * is the injected reducer. Returns the arguments of commitStep.
 */
export function planSavedCommand({actor,session,current,duplicate,expectedVersion,commandId,command,applyCommand}){
  requireNarrator(actor,'Acesso ao módulo de batalhas salvas restrito ao Narrador.');
  if(!session||!current)fail('invalid','Batalha salva não encontrada.');
  if(typeof commandId!=='string'||!UUID.test(commandId)||!Number.isInteger(expectedVersion)||expectedVersion<0||
     expectedVersion>1199||!isObj(command))fail('invalid','Comando inválido');
  if(duplicate){
    if(canonicalJson(JSON.parse(duplicate.commandJson))!==canonicalJson(command))
      fail('conflict','commandId reutilizado com payload diferente.');
    return {duplicate:true,result:{duplicate:true,receipt:JSON.parse(duplicate.eventJson),stateVersion:session.stateVersion}};
  }
  if(session.stateVersion!==expectedVersion)fail('conflict','CONFLICT: a sessão foi atualizada. Recarregue o último estado.');
  const state=JSON.parse(current.json);
  if(battleHash(state)!==session.stateHash)fail('invalid','Integridade não confirmada.');
  const unit=(state.stacks||[]).find(s=>s.id===state.activeUnitId);
  if(command.type!=='MANUAL_FINISH'&&(!unit||(state.controls||{})[unit.side]==='ai'))
    fail('denied','Comandos da IA não podem ser falsificados pelo navegador.');
  if(typeof applyCommand!=='function')fail('invalid','Motor de regras não configurado');
  const next=applyCommand(state,command,'narrator');
  const receipt={actionSeq:expectedVersion+1,commandId:'cmd-'+(expectedVersion+1),command,actor:'narrator',
    prevHash:session.stateHash,stateHash:battleHash(next)};
  return {duplicate:false,commitArgs:{expected:expectedVersion,commandId,command,receipt,current:next,
    prevHash:session.stateHash,stateHash:receipt.stateHash}};
}

/* --------------------------------- live V3 --------------------------------- */

const titleOk=t=>typeof t==='string'&&t.trim().length>=5&&t.trim().length<=120;

export function createLive({actor,title,attackerHouseId,defenderHouseId,housesActive,replay,newId,now}){
  requireNarrator(actor,'Somente o Narrador pode convocar multiplayer.');
  if(!titleOk(title)||typeof attackerHouseId!=='string'||!attackerHouseId.trim()||typeof defenderHouseId!=='string'||
     !defenderHouseId.trim())fail('invalid','Dados da partida inválidos');
  if(attackerHouseId===defenderHouseId)fail('invalid','Multiplayer exige duas casas distintas.');
  if(!housesActive||housesActive[attackerHouseId]!==true||housesActive[defenderHouseId]!==true)
    fail('invalid','Casa não está ativa na campanha.');
  if(!isObj(replay)||!HASH.test(replay.finalHash||''))fail('invalid','Não foi possível criar a partida multiplayer.');
  const at=now||new Date().toISOString(),id=newId();
  return {match:{id,title:title.trim(),attackerHouseId,defenderHouseId,createdBy:actor.uid,stateVersion:0,
    stateHash:replay.finalHash,status:'active',createdAt:at,updatedAt:at},replay:{id,json:JSON.stringify(replay)}};
}
const liveVisible=(actor,m)=>actor.role==='narrador'||canSee(actor,m.attackerHouseId)||canSee(actor,m.defenderHouseId);
export function listLive({actor,matches}){
  return matches.filter(m=>liveVisible(actor,m)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0,60).map(m=>({id:m.id,title:m.title,attackerHouseId:m.attackerHouseId,defenderHouseId:m.defenderHouseId,
      stateVersion:m.stateVersion,status:m.status,updatedAt:m.updatedAt}));
}
/** Visible row or the same error as a revoked access. */
export function visibleLive(actor,match){
  if(!match||!liveVisible(actor,match))fail('not_found','Partida não encontrada ou acesso revogado.');
  return match;
}
const liveSane=(game,match)=>isObj(game)&&isObj(game.battle)&&Array.isArray(game.battle.stacks)&&isObj(game.setup);
export function liveView({actor,match,game}){
  visibleLive(actor,match);
  if(!liveSane(game,match)||game.battle.stacks.some(s=>s.source?.kind!=='fictional')||game.setup.opponent!=='human'||
     battleHash(game)!==match.stateHash)fail('invalid','Partida multiplayer com estado inconsistente.');
  const turn=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  const side=turn?turn.side:null;
  const allowed=side?canControl(actor,side==='attacker'?match.attackerHouseId:match.defenderHouseId):false;
  return {id:match.id,title:match.title,version:match.stateVersion,status:match.status,attackerHouseId:match.attackerHouseId,
    defenderHouseId:match.defenderHouseId,canPlay:match.status==='active'&&allowed,gameJson:JSON.stringify(game)};
}
/**
 * playLiveV3Turn up to the engine. `applyStep`/`capture` are injected. The
 * transaction then rewrites the row only if version, hash and status still match.
 */
export function playLive({actor,match,game,expectedVersion,step,applyStep,capture,now}){
  visibleLive(actor,match);
  if(!Number.isInteger(expectedVersion)||expectedVersion<0||expectedVersion>MAX_LIVE_VERSION-1||!isObj(step))
    fail('invalid','Comando inválido');
  if(match.status!=='active')fail('invalid','Partida já encerrada.');
  if(match.stateVersion!==expectedVersion)fail('conflict','CONFLICT: recarregue o turno atualizado.');
  if(!liveSane(game,match)||game.setup.opponent!=='human'||game.battle.stacks.some(s=>s.source?.kind!=='fictional')||
     battleHash(game)!==match.stateHash)fail('invalid','Integridade da partida não confirmada.');
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  if(!active||game.battle.phase!=='active')fail('invalid','Nenhum turno ativo.');
  const house=active.side==='attacker'?match.attackerHouseId:match.defenderHouseId;
  if(!canControl(actor,house))fail('denied','Esta casa não controla o turno atual.');
  if(step.type==='AI'||(step.type==='COMMAND'&&step.actor!=='narrator'))
    fail('denied','Comandos automáticos não são aceitos do navegador.');
  if(step.type==='COMMAND'&&step.command&&step.command.type==='MANUAL_FINISH'&&actor.role!=='narrador')
    fail('denied','Encerramento manual exclusivo do Narrador.');
  if(typeof applyStep!=='function'||typeof capture!=='function')fail('invalid','Motor de regras não configurado');
  const next=applyStep(game,step);
  if(!Array.isArray(next.steps)||!Array.isArray(game.steps)||next.steps.length!==game.steps.length+1)
    fail('invalid','O comando não avançou o histórico.');
  const file=capture(next);
  const at=now||new Date().toISOString();
  const status=next.battle.phase==='completed'?'completed':'active';
  return {match:{...match,stateVersion:expectedVersion+1,stateHash:file.finalHash,status,updatedAt:at},
    replay:{id:match.id,json:JSON.stringify(file)},result:{version:expectedVersion+1,status:next.battle.phase}};
}

/* ------------------------------- invitations ------------------------------- */

export function createInvitation({actor,input,houseActive,newId,now}){
  requireNarrator(actor,'Convocação exclusiva do Narrador.');
  const d=input;
  if(!isObj(d)||!titleOk(d.title)||typeof d.houseId!=='string'||!d.houseId.trim()||d.houseId.length>100||
     !SCENARIOS.includes(d.scenario)||!MODEL_IDS.includes(d.attackerHouseId)||!MODEL_IDS.includes(d.defenderHouseId)||
     !COMMANDERS.includes(d.attackerCommander)||!COMMANDERS.includes(d.defenderCommander))
    fail('invalid','Convocação inválida');
  if(houseActive!==true)fail('invalid','Casa de destino não está ativa nesta temporada.');
  const id=newId();
  return {id,doc:{id,title:d.title.trim(),targetHouseId:d.houseId.trim(),createdBy:actor.uid,scenario:d.scenario,
    attackerModelId:d.attackerHouseId,defenderModelId:d.defenderHouseId,attackerCommander:d.attackerCommander,
    defenderCommander:d.defenderCommander,status:'open',createdAt:now||new Date().toISOString()}};
}
/** Narrator sees every open invitation; a player only those of a house they belong to. */
export function listInvitations({actor,invitations}){
  return invitations.filter(i=>i.status==='open'&&(actor.role==='narrador'||canSee(actor,i.targetHouseId)))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,30)
    .map(i=>({id:i.id,title:i.title,target_house_id:i.targetHouseId,scenario:i.scenario,attacker_model_id:i.attackerModelId,
      defender_model_id:i.defenderModelId,attacker_commander:i.attackerCommander,defender_commander:i.defenderCommander,
      created_at:i.createdAt,status:i.status}));
}
export function closeInvitation({actor,invitation}){
  requireNarrator(actor,'Convocação exclusiva do Narrador.');
  if(!invitation)fail('not_found','Convocação não encontrada ou não autorizada.');
  return {...invitation,status:'closed'};
}

/* ------------------------------ private D&D data ---------------------------- */

const DND_ID=/^[a-z0-9][a-z0-9-]{0,55}$/;
export function dndSave({actor,battleId,replay,report,now}){
  requireNarrator(actor,'D&D: sessão privada exige Narrador autenticado e ativo.');
  if(typeof battleId!=='string'||battleId.length<1||battleId.length>120||typeof replay!=='string'||replay==='')
    fail('invalid','Não foi possível salvar a batalha D&D.');
  return {ownerId:actor.uid,battleId,replay,reportJson:report==null?null:JSON.stringify(report),
    updatedAt:now||new Date().toISOString()};
}
export const dndSessionDocId=(ownerId,battleId)=>createHash('sha256').update(ownerId+'\u0000'+battleId).digest('hex');
export function dndList({actor,sessions}){
  requireNarrator(actor,'D&D: sessão privada exige Narrador autenticado e ativo.');
  return sessions.filter(s=>s.ownerId===actor.uid).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0,30).map(s=>({battleId:s.battleId,updatedAt:s.updatedAt}));
}
export function dndLoad({actor,battleId,session}){
  requireNarrator(actor,'D&D: sessão privada exige Narrador autenticado e ativo.');
  if(typeof battleId!=='string'||!/^dnd-training-[a-z0-9-]{1,100}$/.test(battleId))fail('invalid','Identificador de batalha inválido.');
  if(!session||session.ownerId!==actor.uid)fail('not_found','Batalha D&D não encontrada na conta do Narrador.');
  if(typeof session.replay!=='string')fail('invalid','Formato de replay privado incompatível.');
  return {replay:session.replay};
}
export function dndSaveOverride({actor,monsterId,patch,now}){
  requireNarrator(actor,'Somente Narrador ativo pode editar o bestiário privado.');
  if(typeof monsterId!=='string'||!DND_ID.test(monsterId)||!isObj(patch))fail('invalid','ID de monstro inválido.');
  return {monsterId,combatPatchJson:JSON.stringify(patch),updatedBy:actor.uid,updatedAt:now||new Date().toISOString()};
}
export function dndRequireMonster(monsterExists){if(!monsterExists)fail('invalid','Monstro fora do catálogo.');}
export function dndResetOverride({actor}){requireNarrator(actor,'Somente Narrador ativo pode editar o bestiário privado.');}
export function dndListOverrides({actor,overrides}){
  requireNarrator(actor,'Somente Narrador ativo pode editar o bestiário privado.');
  return [...overrides].sort((a,b)=>a.monsterId<b.monsterId?-1:1).slice(0,500)
    .map(o=>({monster_id:o.monsterId,combat_patch:JSON.parse(o.combatPatchJson)}));
}
export function dndSaveCustom({actor,payload,now}){
  requireNarrator(actor,'Catálogo privado exige Narrador autenticado e autorizado.');
  if(!isObj(payload)||typeof payload.id!=='string'||!DND_ID.test(payload.id)||!payload.id.startsWith('custom-'))
    fail('invalid','Novas criaturas precisam ter ID iniciado por custom-.');
  return {id:payload.id,payloadJson:JSON.stringify(payload),catalogVersion:2,createdBy:actor.uid,
    updatedAt:now||new Date().toISOString()};
}
export function dndDeleteCustom({actor,id}){
  requireNarrator(actor,'Catálogo privado exige Narrador autenticado e autorizado.');
  if(typeof id!=='string'||!/^custom-[a-z0-9-]{1,48}$/.test(id))fail('invalid','ID extra inválido.');
}
export function dndListCustom({actor,items}){
  requireNarrator(actor,'Catálogo privado exige Narrador autenticado e autorizado.');
  if(items.length>200)fail('invalid','Catálogo V2 excede 200 criaturas extras.');
  return [...items].sort((a,b)=>a.id<b.id?-1:1).map(r=>{
    const p=JSON.parse(r.payloadJson);
    if(p.id!==r.id)fail('invalid','Criatura extra com ID inconsistente.');
    return {id:r.id,payload:p};
  });
}
export function dndCatalog({actor,monsters}){
  requireNarrator(actor,'O bestiário privado exige sessão do Narrador autorizada.');
  return [...monsters].sort((a,b)=>a.id<b.id?-1:1).slice(0,500).map(m=>({id:m.id,name:m.name,group_name:m.groupName,
    source:m.source,challenge_rating:m.challengeRating,hp:m.hp,ac:m.ac,size:m.size,speed_ft:m.speedFt,
    melee:m.meleeJson==null?null:JSON.parse(m.meleeJson),ranged:m.rangedJson==null?null:JSON.parse(m.rangedJson),
    catalog_version:m.catalogVersion}));
}
export function dndVerified({actor,rows}){
  requireNarrator(actor,'O bestiário privado exige sessão do Narrador autorizada.');
  return [...rows].sort((a,b)=>a.monsterId<b.monsterId?-1:1).slice(0,301)
    .map(r=>({monster_id:r.monsterId,combat_defaults:JSON.parse(r.combatDefaultsJson)}));
}
export function rosterFor({actor,houseId,rows}){
  requireNarrator(actor,'Acesso restrito ao Narrador.');
  if(typeof houseId!=='string'||!houseId)fail('invalid','Casa inválida');
  return rows.filter(r=>r.houseId===houseId).sort((a,b)=>a.sourceRow-b.sourceRow).slice(0,100)
    .map(r=>({source_key:r.sourceKey,house_id:r.houseId,unit_name:r.unitName,unit_type:r.unitType,training:r.training,
      quantity:r.quantity,standard_unit_strength:r.standardUnitStrength,source_status:r.sourceStatus,source_row:r.sourceRow}));
}
