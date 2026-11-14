/**
 * Pure port of get_house_character_ages (SQL 0063). Only people explicitly
 * linked to a character sheet record of the house; a gm or player link never
 * becomes house-visible.
 */
import {recordScopeOf} from './record-core.mjs';
import {characterAgeState,CharacterError} from './character-core.mjs';

export function houseCharacterAges({uid,raw,houseId,year,characters,links,records}){
  const actor=recordScopeOf(uid,raw); // active access only
  if(!Number.isInteger(year)||year<1||year>9999)throw new CharacterError('invalid','Ano de consulta inválido');
  if(typeof houseId!=='string'||!houseId)throw new CharacterError('invalid','Casa inválida');
  if(actor.role!=='narrador'&&!actor.memberHouseIds.has(houseId))
    throw new CharacterError('denied','Pessoa não autorizada a consultar esta Casa');
  const chars=new Map(characters.map(c=>[c.id,c]));
  const recs=new Map(records.map(r=>[r.id,r]));
  const counts=new Map();
  for(const l of links)counts.set(l.characterId,(counts.get(l.characterId)||0)+1);
  const out=[];
  for(const l of links){
    if(l.sourceKind!=='campaign_record')continue;
    const r=recs.get(l.sourceKey),c=chars.get(l.characterId);
    if(!r||!c||r.houseId!==houseId||r.kind!=='character')continue;
    const visible=actor.role==='narrador'||
      (r.visibility==='house'&&l.sourceVisibility==='house'&&c.visibility==='house')||
      (r.visibility==='player'&&l.sourceVisibility==='player'&&c.visibility==='player'&&
        c.ownerUserId===uid&&r.playerId!=null&&r.playerId===actor.playerId);
    if(!visible)continue;
    const a=characterAgeState(c,year,counts.get(c.id)||0);
    out.push({record_id:r.id,character_id:c.id,as_of_year:year,status:a.status,age:a.age,death_year:c.deathYear??null});
  }
  return out.sort((x,y)=>x.record_id<y.record_id?-1:x.record_id>y.record_id?1:0);
}
