/**
 * Item 9, projeção do cadastro canônico do acervo privado para o HUB.
 * Nascimento e morte não são incrementados ou gravados a cada semana.
 * A idade é derivada do ano efetivo do Firebase e de fontes revisadas.
 */
import {characterAgeState} from '../../../scripts/firebase/character-core.mjs';
import {houseCharacterAges} from '../../../scripts/firebase/house-ages-core.mjs';
import type {Scope} from './service';
import type {RecordRow} from './operational-records';

export class CharacterAgesError extends Error{
 constructor(readonly code:string,readonly status=503){super(code);}
}
const fail=(code:string,status=503):never=>{throw new CharacterAgesError(code,status);};
const validYear=(v:unknown):v is number=>Number.isSafeInteger(v)&&
 typeof v==='number'&&v>=1&&v<=9999;
const id=(v:unknown):v is string=>typeof v==='string'&&
 v.length>0&&v.length<=128&&!/[\/\u0000-\u001f\u007f]/.test(v);
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&
 typeof v==='number'&&v>=0;

type CanonicalPerson={
 id:string;displayName:string;houseId:string|null;nobleRoles:string[];
 race:string|null;isNoble:boolean;visibility:string;ownerUserId:string|null;
 aliveStatus:'alive'|'deceased'|'unknown';reviewStatus:string;
 confidence:string;birthYear:number|null;baselineAge:number|null;
 baselineYear:number|null;deathYear:number|null;agePolicy:string;
};
type SourceLink={characterId:string;sourceKind:string;sourceKey:string;
 sourceVisibility:string};
export type AgeRegistry={characters:CanonicalPerson[];links:SourceLink[];
 transitions:Record<string,unknown>[]};
const key=(c:CanonicalPerson,year:number,n:number)=>{
 const a=characterAgeState(c,year,n);
 return {...a,reason:a.status==='ok'?'Idade cronológica calculada pelo HUB':
  a.status==='deceased'?'Idade preservada no falecimento':
  a.status==='not_born'?'Nascimento posterior ao período':
  'O cadastro canônico exige revisão do Narrador'};
};
export function projectAgeDashboard(registry:AgeRegistry,year:number,target:number,limit:number){
 if(!validYear(year)||!validYear(target)||!Number.isSafeInteger(limit)||limit<1||limit>2000)
  fail('character_year_invalid',400);
 const counts=new Map<string,number>();
 for(const link of registry.links)
  counts.set(link.characterId,(counts.get(link.characterId)??0)+1);
 const all=[...registry.characters].sort((a,b)=>
  a.displayName.localeCompare(b.displayName,'pt-BR')||a.id.localeCompare(b.id));
 const rows=all.map(c=>{
  const n=counts.get(c.id)??0,before=key(c,year,n),after=key(c,target,n);
  return {id:c.id,display_name:c.displayName,house_id:c.houseId,
   noble_roles:c.nobleRoles,race:c.race,is_noble:c.isNoble,
   visibility:c.visibility,alive_status:c.aliveStatus,
   review_status:c.reviewStatus,confidence:c.confidence,
   birth_year:c.birthYear,death_year:c.deathYear,
   before_age:before,after_age:after};
 });
 const staged=rows.map(r=>({
  ...r,
  conflict:r.before_age.status==='conflict'||r.after_age.status==='conflict',
  pending:!['ok','deceased','not_born'].includes(r.before_age.status)||
    !['ok','deceased','not_born'].includes(r.after_age.status),
  notBorn:r.before_age.status==='not_born'||r.after_age.status==='not_born',
  unknown:(r.before_age.age===null&&r.before_age.status!=='not_born')||
    (r.after_age.age===null&&r.after_age.status!=='not_born'),
  aged:r.is_noble&&r.alive_status==='alive'&&r.before_age.status==='ok'&&
    r.after_age.status==='ok'&&(r.after_age.age??0)>(r.before_age.age??0),
 }));
 return {current_year:year,target_year:target,
  totals:{total:rows.length,
   nobles:rows.filter(r=>r.is_noble).length,
   alive:rows.filter(r=>r.alive_status==='alive').length,
   deceased:rows.filter(r=>r.alive_status==='deceased').length,
   conflicts:staged.filter(r=>r.conflict).length,
   pending:staged.filter(r=>r.pending).length,
   not_born:staged.filter(r=>r.notBorn).length,
   unknown:staged.filter(r=>r.unknown).length,
   aged_nobles:staged.filter(r=>r.aged).length},
  characters:rows.slice(0,limit),truncated:rows.length>limit,
 };
}
export function projectHouseAges(scope:Scope,registry:AgeRegistry,
 records:RecordRow[],houseId:string,year:number){
 if(scope.profile==='editor'||!id(houseId)||!validYear(year))
  fail('access_denied',403);
 if(scope.profile!=='narrador'&&!scope.memberHouseIds.includes(houseId))
  fail('access_denied',403);
 const raw={userId:scope.uid,profile:scope.profile,admin:scope.profile==='narrador',
  active:true,requirePasswordChange:false,playerId:scope.playerId,
  memberHouseIds:scope.memberHouseIds,editHouseIds:scope.editHouseIds};
 return houseCharacterAges({uid:scope.uid,raw,houseId,year,
  characters:registry.characters,links:registry.links,
  records:records.map(r=>({id:r['id'],kind:r['kind'],
   houseId:r['house_id'],playerId:r['player_id'],
   visibility:r['visibility']}))}).map(x=>({
    ...x,reason:x.status==='ok'?'Idade cronológica calculada pelo HUB':
     x.status==='deceased'?'Idade preservada no falecimento':
     'O registro canônico exige revisão do Narrador',
   }));
}
export async function readAgeRegistry(db:any,snapshot:string):Promise<AgeRegistry>{
 if(!/^[a-f0-9]{64}$/.test(snapshot))
  fail('character_source_invalid');
 const root=db.collection('migrationCharacterStage').doc(snapshot);
 const stage=await root.get(),v=stage.data();
 if(!stage.exists||v?.status!=='complete'||v?.private!==true||
    v?.sourceSnapshotId!==undefined&&v.sourceSnapshotId!==snapshot)
  fail('character_source_not_homologated');
 const [characters,links,transitions]=await Promise.all([
  root.collection('characters').limit(2001).get(),
  root.collection('links').limit(5001).get(),
  root.collection('transitions').limit(2001).get(),
 ]);
 const totals=v.counts??{};
 if(characters.docs.length>2000||links.docs.length>5000||
    transitions.docs.length>2000||
    !count(totals.characters)||totals.characters!==characters.docs.length||
    !count(totals.links)||totals.links!==links.docs.length||
    !count(totals.transitions)||totals.transitions!==transitions.docs.length)
  fail('character_source_not_reconciled');
 const people=characters.docs.map((d:any)=>d.data());
 const identifiers=new Set<string>();
 for(const p of people){
  if(!p||!id(p.id)||identifiers.has(p.id)||
    typeof p.displayName!=='string'||p.displayName.length>180||
    !Array.isArray(p.nobleRoles)||p.nobleRoles.some((r:unknown)=>typeof r!=='string')||
    !['gm','house','player'].includes(p.visibility)||
    !['alive','deceased','unknown'].includes(p.aliveStatus)||
    typeof p.isNoble!=='boolean'||!['unverified','supported','confirmed'].includes(p.confidence)||
    !['pending','reviewed','conflict'].includes(p.reviewStatus)||
    p.birthYear!==null&&!validYear(p.birthYear)||
    p.deathYear!==null&&!validYear(p.deathYear)||
    p.baselineYear!==null&&!validYear(p.baselineYear)||
    p.baselineAge!==null&&!count(p.baselineAge))
    fail('character_source_invalid');
  identifiers.add(p.id);
 }
 const linkList=links.docs.map((d:any)=>d.data());
 const used=new Set<string>();
 for(const l of linkList){
  if(!l||!identifiers.has(l.characterId)||!id(l.sourceKind)||
     !id(l.sourceKey)||!['gm','house','player'].includes(l.sourceVisibility)||
     used.has(l.sourceKind+':'+l.sourceKey))
    fail('character_link_invalid');
  used.add(l.sourceKind+':'+l.sourceKey);
 }
 const rawTransitions=transitions.docs.map((d:any)=>d.data());
 for(const t of rawTransitions){
  if(!t||!id(t.id)||!validYear(t.fromYear)||!validYear(t.toYear)||
     Math.abs(t.toYear-t.fromYear)!==1||!count(t.calendarVersion))
   fail('character_transition_invalid');
 }
 return {characters:people,links:linkList,transitions:rawTransitions};
}
export function validatedTransition(row:Record<string,unknown>){
 return id(row['id'])&&validYear(row['fromYear'])&&validYear(row['toYear'])&&
  Math.abs(row['toYear']-row['fromYear'])===1&&count(row['calendarVersion'])&&
  id(row['actor'])&&typeof row['createdAt']==='string'&&
  Number.isFinite(Date.parse(row['createdAt']));
}
export async function listAgeTransitions(db:any,snapshot:string,registry:AgeRegistry,
 limit:number){
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)
  fail('character_transition_limit_invalid',400);
 const root=db.collection('campaignCloudRuntime').doc(snapshot);
 const live=await root.get(),v=live.data();
 if(!live.exists||v?.status!=='active'||v?.private!==true||
    v?.sourceSnapshotReconciled!==true||v?.sourceSnapshotId!==snapshot||
    v?.applicationEnabled!==true)
  return registry.transitions.filter(validatedTransition)
   .sort((a,b)=>String(b['createdAt']).localeCompare(String(a['createdAt']))).slice(0,limit)
   .map(toHistoric);
 const docs=await root.collection('characterYearTransitions').limit(1001).get();
 if(docs.docs.length>1000)fail('character_transitions_too_many');
 const ops=docs.docs.map((d:any)=>d.data());
 if(!ops.every(validatedTransition))fail('character_transition_invalid');
 const historical=registry.transitions.filter(validatedTransition);
 return [...ops,...historical].sort((a,b)=>
  String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,limit)
  .map(toHistoric);
}
function toHistoric(t:Record<string,any>){
 return {id:t.id,calendar_version:t.calendarVersion,
  from_year:t.fromYear,to_year:t.toYear,actor:t.actor,
  created_at:t.createdAt};
}
