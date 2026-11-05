import type {BattleMap} from '@/lib/battle/domain/types';
import { battleMapSchema } from '@/lib/battle/domain/setup';
import { validateBattleMap } from '@/lib/battle/geometry/map-validation';
const LIMIT=150_000;
export function parseBattleMapJson(raw:string):BattleMap{
  if(raw.length>LIMIT)throw new Error('Arquivo de mapa excede o limite de 150 KB.');
  let json:unknown;
  try{json=JSON.parse(raw) as unknown;}catch{throw new Error('O arquivo não contém JSON válido.');}
  const map=battleMapSchema.parse(json);
  const warnings=validateBattleMap(map);
  if(warnings.length)throw new Error('Mapa inválido: '+warnings.join('; '));
  return map;
}
export function serializeBattleMap(map:BattleMap):string{
  return JSON.stringify(parseBattleMapJson(JSON.stringify(map)),null,2);
}
export function downloadBattleJson(filename:string,content:string):void{
  const file=new Blob([content],{type:'application/json'});
  const url=URL.createObjectURL(file);
  try{
    const link=document.createElement('a');
    link.href=url;link.download=filename.replace(/[^a-z0-9._-]/gi,'_');
    document.body.appendChild(link);link.click();link.remove();
  }finally{URL.revokeObjectURL(url);}
}
