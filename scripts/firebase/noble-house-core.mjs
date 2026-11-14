/**
 * Pure rules of the noble house operation (port of the SQL function
 * commit_noble_house_operation). No I/O: the transactional service feeds it
 * the current sheet and ledger entry and persists the returned result.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STATE_BYTES=900_000;
const MAX_TEXT=20_000;
// In SQL only unit/unit_state get special handling (commander resolution
// against campaign_records, not modeled yet): they fail closed. Any other
// action name is free text, exactly as in commit_noble_house_operation.
const UNSUPPORTED=new Set(['unit','unit_state']);

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
  if(UNSUPPORTED.has(action))fail('unsupported','Ação ainda não suportada');
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

/**
 * @param actor      result of scopeOf
 * @param request    raw request
 * @param currentSheet {state,version}|null  sheet doc payload
 * @param existingLedger ledger payload for (house, operationKey) or null
 * @returns {duplicate:boolean, sheet?, ledger?, version}
 */
export function applyNobleHouseOperation({actor,request,currentSheet,existingLedger,now}){
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
  return {
    duplicate:false,version:next,
    sheet:{houseId:req.houseId,state:req.state,version:next,
      updatedBy:actor.uid,updatedAt:at,syncState:'pending'},
    ledger:{houseId:req.houseId,operationKey:req.operationKey,actor:actor.uid,
      action:req.action,explanation:req.explanation,rule:req.rule,
      campaignMonth:req.month,beforeState:currentSheet?currentSheet.state:{},
      afterState:req.state,version:next,createdAt:at},
  };
}
