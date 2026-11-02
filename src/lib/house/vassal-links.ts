import {isNarrativeNpc} from './narrative-npc';
import type { HouseState } from './types';

export type VassalNpc = { id:string; title:string; content:string };
export type VassalHouse = { id:string; name:string; crest:string|null;region?:string|null;castle?:string|null;lord_name?:string|null };
/** A null official crest must not erase valid artwork imported from the public archive.
 * Preserve the same precedence for regional display metadata. */
export function mergeOfficialHouse(archive:VassalHouse|undefined,official:VassalHouse):VassalHouse {
 return {...archive,...official,
  region:official.region||archive?.region||null,
  crest:official.crest?.trim()||archive?.crest||null,
  castle:official.castle?.trim()||archive?.castle||null,
  lord_name:official.lord_name?.trim()||archive?.lord_name||null,
 };
}
export function validateVassalNpcs(houseId:string,ids:string[],records:{id:string;house_id:string|null;kind:string;title:string;content:string}[]) {
  if(new Set(ids).size!==ids.length)throw new Error('Um NPC não pode ser vinculado duas vezes ao mesmo brasão.');
  for(const id of ids){const record=records.find(r=>r.id===id);if(!record||record.house_id!==houseId||!isNarrativeNpc(record))throw new Error('Selecione apenas NPCs existentes e acessíveis desta casa.');}
  return [...ids];
}
export function linkVassalNpcs(state:HouseState,id:string,npcIds:string[]):HouseState {
  const next=structuredClone(state),v=next.vassals?.find(v=>v.id===id);
  if(!v||v.status!=='approved')throw new Error('Somente vínculos aprovados podem receber esta alteração.');
  if(new Set(npcIds).size!==npcIds.length)throw new Error('NPC duplicado no vínculo.');
  v.npcIds=[...npcIds];return next;
}
