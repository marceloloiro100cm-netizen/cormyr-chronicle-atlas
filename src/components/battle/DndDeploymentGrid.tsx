/** Implantação manual exclusiva do D&D V3; indica áreas por tamanho.
 * Cada ação só altera o rascunho local, validado novamente pelo motor.
 */
import {useMemo} from 'react';
import type {DndStackDraft} from '@/lib/crusade/dnd-battle';
import type {CrzCreature} from '@/lib/crusade/creatures';
import {crzFootprintCells,crzHexKey,crzMapIndex,
 type CrzHex,type CrzMap} from '@/lib/crusade/geometry';

export function DndDeploymentGrid({map,drafts,creatures,selectedId,onSelected,onPlace}:{
 map:CrzMap;drafts:readonly DndStackDraft[];creatures:readonly CrzCreature[];
 selectedId:string;onSelected:(id:string)=>void;
 onPlace:(id:string,position:CrzHex|undefined)=>void;
}){
 const selected=drafts.find(x=>x.id===selectedId);
 const byId=useMemo(()=>new Map(creatures.map(x=>[x.id,x])),[creatures]);
 const terrain=useMemo(()=>crzMapIndex(map),[map]);
 const occupied=useMemo(()=>{
  const keys=new Set<string>();
  for(const draft of drafts){
   if(!draft.position||draft.id===selectedId)continue;
   const creature=byId.get(draft.templateId);
   if(!creature)continue;
   for(const c of crzFootprintCells(map,draft.position,creature.size))
    keys.add(crzHexKey(c));
  }
  return keys;
 },[drafts,selectedId,map,byId]);
 const canPlace=(pos:CrzHex)=>{
  if(!selected)return false;
  const creature=byId.get(selected.templateId);
  if(!creature)return false;
  if(!map.deployment[selected.side].some(p=>crzHexKey(p)===crzHexKey(pos)))return false;
  if(terrain.get(crzHexKey(pos))?.terrain==='rock')return false;
  const flying=creature.flags.flying&&(creature.speedFt.fly??0)>0;
  return crzFootprintCells(map,pos,creature.size).every(p=>{
   const tile=terrain.get(crzHexKey(p));
   return Boolean(tile&&!occupied.has(crzHexKey(p))&&
    (flying||tile.terrain!=='rock'));
  });
 };
 const actual=selected?.position?
  new Set(crzFootprintCells(map,selected.position,
   byId.get(selected.templateId)?.size??'M').map(crzHexKey)):new Set<string>();
 const tiles=[...map.tiles].sort((a,b)=>a.r-b.r||a.q-b.q);
 const ground:Record<string,string>={
  plain:'#254239',forest:'#174533',hill:'#61543a',rock:'#4f5661',
 };
 return <section className="battle-surface" aria-label="Implantação manual D&D">
  <h4>Posicionamento manual antes da batalha</h4>
  <p className="battle-note">Escolha uma pilha, depois um quadrado verde de sua zona.
   Quadrados ocupados, obstruídos e áreas sobrepostas são bloqueados.
   Cores: verde/planície, floresta, colina e cinza/barreira.
   O posicionamento automático permanece disponível.</p>
  <label>Unidade para posicionar
   <select aria-label="Selecionar pilha para posicionamento D&D" value={selectedId}
    onChange={e=>onSelected(e.target.value)}>
    {drafts.map(d=><option key={d.id} value={d.id}>
     {byId.get(d.templateId)?.name??d.templateId} · {d.side==='attacker'?'Atacante':'Defensor'}
    </option>)}
   </select>
  </label>
  <div role="group" aria-label="Zonas e quadrados válidos para implantação D&D"
   style={{display:'grid',gridTemplateColumns:`repeat(${map.width}, minmax(30px,1fr))`,
    maxWidth:'820px',gap:'3px'}}>
   {tiles.map(tile=>{
    const key=crzHexKey(tile),legal=canPlace(tile);
    const selectedAt=selected?.position&&crzHexKey(selected.position)===key;
    const mark=drafts.find(x=>x.position&&crzHexKey(x.position)===key);
    return <button key={key} type="button" disabled={!legal&&!selectedAt}
     title={`(${tile.q}, ${tile.r}) · ${tile.terrain}`}
     aria-label={`Quadrado ${tile.q}, ${tile.r}: ${legal?'livre':'indisponível'}`}
     aria-pressed={Boolean(selectedAt)}
     onClick={()=>selected&&onPlace(selected.id,selectedAt?undefined:{q:tile.q,r:tile.r})}
     style={{minHeight:34,minWidth:30,padding:2,borderRadius:4,
      background:actual.has(key)?'#2d7c50':ground[tile.terrain],
      color:'#fff',border:legal?'2px solid #81e59d':'1px solid #828282',
      opacity:legal||selectedAt?1:0.5,fontSize:10}}>
     {mark?'●':selectedAt?'✓':legal?'·':' '}
    </button>;
   })}
  </div>
  <p className="battle-note">✓ posição selecionada · ● outra pilha implantada.
   O tamanho real da área ocupada é verificado no início do encontro.</p>
 </section>;
}
