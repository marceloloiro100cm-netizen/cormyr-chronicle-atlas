import type {WarPosition,WarSide} from './types';
import {terrainAt,terrainEffect} from './terrain';
import type {WarTerrainTile} from './terrain';
export type WarLabDeployment=Readonly<{
 id:string;side:WarSide;name:string;position:WarPosition;
}>;
const EXTRA_ROWS=[0,1,3,5,6] as const;
/** Narrator laboratory placements on the existing 12×7 war map.
 * The four original slots stay unchanged for read-only House imports.
 * Additional positions are strictly model troops, never cloned House records.
 */
export function modelWarLabDeployments(extraPerSide:number):readonly WarLabDeployment[]{
 if(!Number.isInteger(extraPerSide)||extraPerSide<0||extraPerSide>EXTRA_ROWS.length)
  throw new Error('O laboratório admite de 0 a 5 unidades extras por lado.');
 const basic:WarLabDeployment[]=[
  {id:'attacker-1',side:'attacker',name:'Vanguarda atacante',position:{x:1,y:2}},
  {id:'attacker-2',side:'attacker',name:'Apoio atacante',position:{x:1,y:4}},
  {id:'defender-1',side:'defender',name:'Vanguarda defensora',position:{x:10,y:2}},
  {id:'defender-2',side:'defender',name:'Apoio defensor',position:{x:10,y:4}},
 ];
 for(let i=0;i<extraPerSide;i++){
  const row=EXTRA_ROWS[i]!;
  basic.push({id:'attacker-'+(i+3),side:'attacker',
   name:'Reforço atacante '+(i+1),position:{x:1,y:row}});
  basic.push({id:'defender-'+(i+3),side:'defender',
   name:'Reforço defensor '+(i+1),position:{x:10,y:row}});
 }
 return basic;
}

/** Read-only preview. The four imported House slots and extra model slots
 * share the same placement algorithm, never changing House records.
 */
export function placedWarLabDeployments(
 extraPerSide:number,positions:Readonly<Record<string,WarPosition>>,
):readonly WarLabDeployment[]{
 return modelWarLabDeployments(extraPerSide).map(unit=>({
  ...unit,position:positions[unit.id]?{...positions[unit.id]}:{...unit.position},
 }));
}
export function validateWarLabPlacement(
 deployments:readonly WarLabDeployment[],tiles:readonly WarTerrainTile[],
 unitTypes:Readonly<Record<string,string>>,width=12,height=7,
):void{
 const used=new Set<string>();
 for(const unit of deployments){
  const p=unit.position;
  if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||
   p.x>=width||p.y>=height)
   throw new Error(unit.name+' está fora dos limites do mapa.');
  const key=p.x+':'+p.y;
  if(used.has(key))throw new Error('Duas unidades não podem ocupar o mesmo quadrado.');
  used.add(key);
  const tile=terrainAt(tiles,p),effect=terrainEffect(tile);
  const naval=unitTypes[unit.id]==='warships';
  const mounted=unitTypes[unit.id]==='cavalry';
  if(naval&&!effect.naval)throw new Error(unit.name+' precisa de água navegável ou costa.');
  if(!naval&&(effect.blocked||effect.water))
   throw new Error(unit.name+' não pode ser posicionada em água ou terreno bloqueado.');
  if(mounted&&effect.noCavalry)
   throw new Error(unit.name+' não pode ser posicionada em terreno proibido à cavalaria.');
 }
}
/** Validated coordinate relocation, preserving unchanged positions on failure. */
export function moveWarLabDeployment(
 extraPerSide:number,positions:Readonly<Record<string,WarPosition>>,
 unitId:string,to:WarPosition,tiles:readonly WarTerrainTile[],
 unitTypes:Readonly<Record<string,string>>,
):Readonly<Record<string,WarPosition>>{
 if(!modelWarLabDeployments(extraPerSide).some(u=>u.id===unitId))
  throw new Error('Unidade de posicionamento inexistente.');
 const next={...positions,[unitId]:{...to}};
 validateWarLabPlacement(placedWarLabDeployments(extraPerSide,next),tiles,unitTypes);
 return next;
}
