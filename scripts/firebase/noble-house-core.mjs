/**
 * Pure rules of the noble house operation (port of the SQL function
 * commit_noble_house_operation). No I/O: the transactional service feeds it
 * the current sheet and ledger entry and persists the returned result.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STATE_BYTES=900_000;
const MAX_TEXT=20_000;
// In SQL only unit/unit_state get special handling (commander resolution
// against campaign_records). Any other action name is free text, exactly as
// in commit_noble_house_operation.
const UNIT_ACTIONS=new Set(['unit','unit_state']);
const COMMANDER_ROLE='Comandante de Exército';

export class NobleHouseError extends Error {
  constructor(code,message){super(message);this.name='NobleHouseError';this.code=code;}
}
const fail=(code,message)=>{throw new NobleHouseError(code,message);};

export function scopeOf(uid,raw){
  if(!raw||raw.userId!==uid||raw.active!==true||raw.requirePasswordChange===true)
    fail('denied','Acesso negado');
  if(raw.profile==='narrador'&&raw.admin===true)
    return {role:'narrador',uid,memberHouseIds:new Set(),editHouseIds:new Set()};
  if(raw.profile!=='jogador'||raw.admin!==false||
     !Array.isArray(raw.memberHouseIds)||!Array.isArray(raw.editHouseIds)||
     !raw.memberHouseIds.every(x=>typeof x==='string'&&x.length>0)||
     !raw.editHouseIds.every(x=>typeof x==='string'&&x.length>0))
    fail('denied','Acesso negado');
  return {role:'jogador',uid,
    memberHouseIds:new Set(raw.memberHouseIds),
    editHouseIds:new Set(raw.editHouseIds)};
}

export const canEditHouse=(actor,houseId)=>
  actor.role==='narrador'||actor.editHouseIds.has(houseId);
export const canReadHouse=(actor,houseId)=>
  actor.role==='narrador'||actor.memberHouseIds.has(houseId);

export function validateOperationRequest(request){
  if(!request||typeof request!=='object')fail('invalid','Pedido inválido');
  const {houseId,operationKey,action,explanation,rule,version,state}=request;
  if(typeof houseId!=='string'||!houseId||houseId.length>512)fail('invalid','Casa inválida');
  if(typeof operationKey!=='string'||!UUID.test(operationKey))
    fail('invalid','Chave de operação inválida');
  if(typeof action!=='string'||!action||action.length>64)fail('invalid','Ação inválida');
  for(const [name,value] of [['explanation',explanation],['rule',rule]]){
    if(value!==undefined&&value!==null&&
       (typeof value!=='string'||value.length>MAX_TEXT))
      fail('invalid','Texto inválido: '+name);
  }
  if(!Number.isInteger(version)||version<0)fail('invalid','Versão inválida');
  if(!state||typeof state!=='object'||Array.isArray(state))fail('invalid','Estado inválido');
  if(state.houseId!==houseId)fail('invalid','Estado não pertence à casa');
  if(!(state.schemaVersion===1||state.schemaVersion==='1'))
    fail('invalid','Versão de esquema não suportada');
  if(Buffer.byteLength(JSON.stringify(state),'utf8')>MAX_STATE_BYTES)
    fail('invalid','Ficha grande demais');
  // The ledger month comes from the state itself: (p_state->>'month')::integer.
  let stateMonth=null;
  if(state.month!==undefined&&state.month!==null){
    const t=String(state.month);
    if(!/^-?\d+$/.test(t))fail('invalid','Mês da ficha deve ser inteiro');
    stateMonth=Number(t);
  }
  return {houseId,operationKey,action,explanation:explanation??'',rule:rule??'',
    month:stateMonth,version,state};
}

const fold=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const text=v=>v==null?null:typeof v==='object'?JSON.stringify(v):String(v);

/**
 * Commander resolution of unit/unit_state (SQL 0039), run only after the
 * version check. House-visible NPC records are reused (oldest first); private
 * names are never copied into a shared sheet. Returns the resolved state and
 * the character records that must be created in the same transaction.
 */
export function resolveUnitCommanders({state,currentState,houseId,houseRecords,actorUid,newId,now}){
  const units=state.units==null?[]:state.units;
  if(!Array.isArray(units))fail('invalid','Unidades inválidas');
  let court=state.court==null?[]:state.court;
  if(!Array.isArray(court))fail('invalid','Corte inválida');
  const oldUnits=currentState&&Array.isArray(currentState.units)?currentState.units:[];
  const pool=houseRecords.filter(r=>r.houseId===houseId&&r.kind==='character'&&r.visibility==='house')
    .map(r=>({...r}));
  const created=[],out=[];
  const at=now||new Date().toISOString();
  for(let u of units){
    const old=oldUnits.find(o=>o&&text(o.id)===text(u&&u.id));
    const commander=(u&&u.commanderName!=null?String(u.commanderName):'').trim();
    if(commander!==''&&(old===undefined||(old.commanderName??null)!==commander)){
      const key=fold(commander);
      let npc=pool.filter(r=>!/^ficha\b/i.test(r.title)&&fold(String(r.title).trim())===key)
        .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id)))[0];
      if(!npc){
        npc={id:newId(),houseId,playerId:null,visibility:'house',kind:'character',title:commander,
          content:'Comandante da unidade '+(u.name==null?'':String(u.name)),version:1,createdBy:actorUid,
          updatedBy:actorUid,createdAt:at,updatedAt:at,syncState:'pending',lastSyncedAt:null,
          sourceFileId:null,sourceModifiedAt:null};
        pool.push(npc);created.push(npc);
      }
      let member=court.find(c=>c&&text(c.npcId)===npc.id&&c.role===COMMANDER_ROLE);
      if(!member){
        member={id:newId(),npcId:npc.id,name:commander,role:COMMANDER_ROLE,
          notes:'Comandante da unidade '+(u.name==null?'':String(u.name))};
        court=[...court,member];
      }
      u={...u,commanderId:member.id};
    }
    out.push(u);
  }
  const next={...state,units:out};
  if(court!==state.court&&!(state.court==null&&court.length===0))next.court=court;
  return {state:next,newRecords:created};
}

/**
 * @param actor      result of scopeOf
 * @param request    raw request
 * @param currentSheet {state,version}|null  sheet doc payload
 * @param existingLedger ledger payload for (house, operationKey) or null
 * @returns {duplicate:boolean, sheet?, ledger?, version}
 */
export function applyNobleHouseOperation({actor,request,currentSheet,existingLedger,now,commanderContext=null}){
  const req=validateOperationRequest(request);
  if(!canEditHouse(actor,req.houseId))fail('denied','Acesso negado');
  if(existingLedger){
    if(existingLedger.actor===actor.uid&&existingLedger.action===req.action)
      return {duplicate:true,version:existingLedger.version};
    fail('conflict','Chave de operação já usada');
  }
  const currentVersion=currentSheet?currentSheet.version:0;
  if(currentVersion!==req.version)fail('conflict','A ficha mudou em outra janela');
  const next=req.version+1;
  const at=now||new Date().toISOString();
  let state=req.state,newRecords=[];
  if(UNIT_ACTIONS.has(req.action)){
    if(!commanderContext)fail('unsupported','Resolução de comandantes indisponível');
    const r=resolveUnitCommanders({state,currentState:currentSheet?currentSheet.state:null,houseId:req.houseId,
      houseRecords:commanderContext.houseRecords,actorUid:actor.uid,newId:commanderContext.newId,now:at});
    state=r.state;newRecords=r.newRecords;
  }
  return {
    duplicate:false,version:next,newRecords,
    sheet:{houseId:req.houseId,state,version:next,
      updatedBy:actor.uid,updatedAt:at,syncState:'pending'},
    ledger:{houseId:req.houseId,operationKey:req.operationKey,actor:actor.uid,
      action:req.action,explanation:req.explanation,rule:req.rule,
      campaignMonth:req.month,beforeState:currentSheet?currentSheet.state:{},
      afterState:state,version:next,createdAt:at},
  };
}
