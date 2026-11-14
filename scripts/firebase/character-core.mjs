/**
 * Pure rules of the canonical character registry (port of 0062/0063:
 * save_campaign_character, save_character_relation, review_character_source,
 * character_age_state). No I/O. Registry is Narrator-only.
 */
const ALIVE=['alive','deceased','unknown'];
const VIS=['gm','house','player'];
const CONF=['unverified','supported','confirmed'];
const REVIEW=['pending','reviewed','conflict'];
const POLICY=['year_turn','manual_exception'];
const RELATIONS=['parent','spouse','sibling','guardian','other'];
const ACTIONS=['link','ignore','conflict','reopen'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE=/^(\d{4})-\d{2}-\d{2}$/;

export class CharacterError extends Error {
  constructor(code,message){super(message);this.name='CharacterError';this.code=code;}
}
const fail=(code,m)=>{throw new CharacterError(code,m);};
export const requireNarrator=raw=>{
  if(!raw||raw.active!==true||raw.profile!=='narrador'||raw.admin!==true||
     raw.requirePasswordChange===true)fail('denied','Restrito ao Narrador');
};
const reasonOk=r=>typeof r==='string'&&r.trim().length>=10;
const year=(v,name)=>{
  if(v===undefined||v===null||v==='')return null;
  if(!Number.isInteger(v)||v<1||v>9999)fail('invalid','Valor inválido: '+name);
  return v;
};
const strList=(v,name)=>{
  if(v===undefined||v===null)return [];
  if(!Array.isArray(v)||!v.every(x=>typeof x==='string'&&x.length<=200)||v.length>100)
    fail('invalid','Lista inválida: '+name);
  return v;
};
const optText=(v,max=2000)=>{
  if(v===undefined||v===null||v==='')return null;
  if(typeof v!=='string'||v.length>max)fail('invalid','Texto inválido');
  return v;
};

/** @returns normalized character fields (without ids/versions/audit). */
export function normalizeCharacterPayload(p,{houseExists}){
  if(!p||typeof p!=='object'||Array.isArray(p))fail('invalid','Cadastro inválido');
  const name=typeof p.displayName==='string'?p.displayName.trim():'';
  if(name.length<1||name.length>180)fail('invalid','Nome canônico inválido');
  const houseId=p.houseId||null;
  if(houseId!==null&&(typeof houseId!=='string'||!houseExists(houseId)))
    fail('invalid','Casa oficial inexistente');
  const birthYear=year(p.birthYear,'birthYear'),baseAge=p.baselineAge??null,
    baseYear=year(p.baselineYear,'baselineYear'),deathYear=year(p.deathYear,'deathYear');
  if(baseAge!==null&&(!Number.isInteger(baseAge)||baseAge<0||baseAge>9999))
    fail('invalid','Idade de referência inválida');
  if((baseAge===null)!==(baseYear===null))fail('invalid','Idade e ano de referência andam juntos');
  const birthDate=optText(p.birthDate,40),deathDate=optText(p.deathDate,40);
  const chk=(d,y,n)=>{if(d===null)return;const m=DATE.exec(d);
    if(!m||y===null||Number(m[1])!==y)fail('invalid','Data incoerente com o ano: '+n);};
  chk(birthDate,birthYear,'nascimento');chk(deathDate,deathYear,'morte');
  if(deathYear!==null&&birthYear!==null&&deathYear<birthYear)
    fail('invalid','Morte anterior ao nascimento');
  const agePolicy=p.agePolicy??'year_turn',aliveStatus=p.aliveStatus??'unknown',
    visibility=p.visibility??'gm',confidence=p.confidence??'unverified';
  if(!POLICY.includes(agePolicy)||!ALIVE.includes(aliveStatus)||!VIS.includes(visibility)||
     !CONF.includes(confidence))fail('invalid','Valor fora do domínio');
  const ageNote=optText(p.ageExceptionNote);
  if(agePolicy==='manual_exception'&&(ageNote||'').trim().length<10)
    fail('invalid','Exceção etária exige justificativa específica');
  const ownerUserId=p.ownerUserId||null;
  if(visibility==='house'&&houseId===null)fail('invalid','Visibilidade de Casa exige Casa');
  if(visibility==='player'&&ownerUserId===null)fail('invalid','Visibilidade de jogador exige dono');
  let reviewStatus=p.reviewStatus??'pending',note=typeof p.reviewNote==='string'?p.reviewNote:'';
  if(!REVIEW.includes(reviewStatus)||note.length>5000)fail('invalid','Revisão inválida');
  if(birthYear!==null&&baseAge!==null&&baseYear!==null&&baseAge!==baseYear-birthYear){
    reviewStatus='conflict';
    note=[note,'Inconsistência entre nascimento e idade de referência.'].filter(Boolean).join(' ');
  }
  return {displayName:name,aliases:strList(p.aliases,'aliases'),houseId,
    nobleRoles:strList(p.nobleRoles,'nobleRoles'),race:optText(p.race,200),
    isNoble:p.isNoble===undefined?true:p.isNoble===true,
    birthYear,birthDate,baselineAge:baseAge,baselineYear:baseYear,agePolicy,
    ageExceptionNote:ageNote,apparentAge:optText(p.apparentAge,200),aliveStatus,
    deathYear,deathDate,visibility,ownerUserId,confidence,reviewStatus,reviewNote:note};
}

export function applyCharacterSave({actorUid,id,version,payload,reason,current,houseExists,newId,now}){
  if(!reasonOk(reason))fail('invalid','Justificativa de pelo menos dez caracteres');
  const fields=normalizeCharacterPayload(payload,{houseExists});
  const at=now||new Date().toISOString();
  if(id){
    if(!current||version!==current.version)fail('conflict','Pessoa alterada em outra sessão');
    const saved={...current,...fields,id,version:current.version+1,updatedBy:actorUid,updatedAt:at};
    return {created:false,character:saved,audit:{action:'update',before:current,after:saved,reason}};
  }
  if(version!==null&&version!==undefined)fail('invalid','Cadastro novo não deve ter versão');
  const saved={...fields,id:newId,version:1,createdBy:actorUid,updatedBy:actorUid,
    createdAt:at,updatedAt:at};
  return {created:true,character:saved,audit:{action:'create',before:null,after:saved,reason}};
}

/** Descendants of `start` following parent edges ({from,to}: from is parent of to). */
export function descendants(edges,start){
  const seen=new Set([start]),stack=[start];
  while(stack.length){const cur=stack.pop();
    for(const e of edges)if(e.from===cur&&!seen.has(e.to)){seen.add(e.to);stack.push(e.to);}}
  return seen;
}
export function validateRelation({from,to,relation,reason,existing,parentEdges,knownIds}){
  if(!UUID.test(from||'')||!UUID.test(to||'')||from===to||!RELATIONS.includes(relation))
    fail('invalid','Relação genealógica inválida');
  if(!reasonOk(reason))fail('invalid','Justificativa obrigatória');
  if(!knownIds.has(from)||!knownIds.has(to))fail('invalid','Personagens canônicos não encontrados');
  if(relation==='parent'&&descendants(parentEdges,to).has(from))
    fail('conflict','Ciclo genealógico não permitido');
  if((relation==='spouse'||relation==='sibling')&&
     existing.some(r=>r.relation===relation&&r.from===to&&r.to===from))
    fail('conflict','Vínculo simétrico já cadastrado');
  if(existing.some(r=>r.relation===relation&&r.from===from&&r.to===to))
    fail('conflict','Relação genealógica já cadastrada');
}

export function applyReviewAction({queueItem,action,characterId,reason,character,existingLink}){
  if(!ACTIONS.includes(action)||!reasonOk(reason))fail('invalid','Ação e justificativa obrigatórias');
  if(!queueItem)fail('invalid','Fonte candidata não localizada');
  if(queueItem.status==='linked'&&action!=='link')fail('conflict','Fonte já vinculada');
  let link=null;
  if(action==='link'){
    if(!characterId||!character)fail('invalid','Selecione pessoa canônica');
    if(queueItem.houseId&&character.houseId&&queueItem.houseId!==character.houseId)
      fail('conflict','Casa divergente: revisão manual antes do vínculo');
    if(existingLink&&existingLink.characterId!==characterId)
      fail('conflict','Fonte já pertence a outra pessoa');
    if(!existingLink)link={characterId,sourceKind:queueItem.sourceKind,sourceKey:queueItem.sourceKey,
      sourceVisibility:queueItem.sourceVisibility,sourceReference:queueItem.evidence||{}};
  }else if(characterId)fail('invalid','Somente a ação link aceita identidade canônica');
  const status={link:'linked',ignore:'ignored',conflict:'conflict',reopen:'pending'}[action];
  return {link,status,characterId:action==='link'?characterId:null,note:reason.trim()};
}

/** Port of character_age_state(). sourceCount = number of source links. */
export function characterAgeState(c,y,sourceCount){
  if(!Number.isInteger(y)||y<1||y>9999)fail('invalid','Ano de consulta inválido');
  let status;
  const hasBoth=c.birthYear!=null&&c.baselineAge!=null;
  if(c.reviewStatus==='conflict')status='conflict';
  else if(c.reviewStatus!=='reviewed')status='pending_review';
  else if(!['supported','confirmed'].includes(c.confidence))status='unverified';
  else if(sourceCount===0)status='pending_source';
  else if(c.agePolicy==='manual_exception')status='manual_exception';
  else if(c.birthYear==null&&c.baselineAge==null)status='unknown_birth';
  else if(hasBoth&&c.baselineAge!==c.baselineYear-c.birthYear)status='conflict';
  else if(c.aliveStatus==='unknown')status='unknown_life';
  else if(c.aliveStatus==='deceased'&&c.deathYear==null)status='unknown_death';
  else if(c.aliveStatus==='alive'&&c.deathYear!=null)status='conflict';
  else if(c.deathYear!=null&&c.birthYear!=null&&c.deathYear<c.birthYear)status='conflict';
  else status='ok';
  const b=c.birthYear??(c.baselineYear!=null&&c.baselineAge!=null?c.baselineYear-c.baselineAge:null);
  if(b!==null&&b<1)status='conflict';
  const base={as_of_year:y,life:c.aliveStatus};
  if(status!=='ok')return {...base,status,age:null};
  if(y<b)return {...base,status:'not_born',age:null};
  const eventYear=c.aliveStatus==='deceased'?Math.min(y,c.deathYear):y;
  const age=eventYear-b;
  if(age<0)return {...base,status:'not_born',age:null};
  const dead=c.aliveStatus==='deceased'&&y>=c.deathYear;
  return {...base,status:dead?'deceased':'ok',age,birth_year:b,death_year:c.deathYear??null,
    life:c.aliveStatus==='deceased'&&y<c.deathYear?'alive':c.aliveStatus};
}
