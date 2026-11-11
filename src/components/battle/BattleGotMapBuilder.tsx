import {useRef,useState} from 'react';
import {WAR_FORT_PROFILES,type WarFortKind} from '@/lib/battle/got/fortifications';
import {WAR_TERRAIN_CATALOG,WAR_TERRAIN_COLORS,WAR_TERRAIN_GLYPHS,fortAt,fortRules,paintWarTerrain,
 placeWarFort,removeWarFortAt,terrainRules,warTerrainInfo,type WarMapDraft,type WarTerrainGroup}
 from '@/lib/battle/got/map-builder';
import type {WarTerrainId} from '@/lib/battle/got/terrain';
import type {WarSide} from '@/lib/battle/got/types';
import './battle-got-map-builder.css';

/** Construtor de mapa: escolha uma peça (terreno ou construção) e pinte no campo.
 * Apenas edita o rascunho do mapa; bônus e penalidades são aplicados pelo motor
 * a partir do mesmo rascunho quando a batalha começa.
 */
type Brush=Readonly<{kind:'terrain';id:WarTerrainId}|{kind:'fort';id:WarFortKind}|
 {kind:'bridge'}|{kind:'road'}|{kind:'erase'}>;
const GROUPS:readonly WarTerrainGroup[]=['Campo','Elevação','Vegetação','Água','Povoado','Obstáculo'];
const FORT_KINDS=Object.keys(WAR_FORT_PROFILES) as WarFortKind[];
const SIDE:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
export function BattleGotMapBuilder({draft,onChange}:{
 draft:WarMapDraft;onChange:(draft:WarMapDraft)=>void;
}){
 const [brush,setBrush]=useState<Brush>({kind:'terrain',id:'hill'});
 const [fortSide,setFortSide]=useState<WarSide>('defender');
 const painting=useRef(false);
 const tiles=new Map(draft.tiles.map(t=>[t.x+':'+t.y,t] as const));
 const apply=(x:number,y:number)=>{
  const at={x,y},tile=tiles.get(x+':'+y);
  if(brush.kind==='terrain')onChange(paintWarTerrain(draft,brush.id,at));
  else if(brush.kind==='fort')onChange(placeWarFort(draft,brush.id,fortSide,at));
  else if(brush.kind==='bridge')onChange(paintWarTerrain(draft,'river',at,{bridge:true}));
  else if(brush.kind==='road')onChange(paintWarTerrain(draft,tile?.terrain??'plain',at,{road:true}));
  else onChange(paintWarTerrain(removeWarFortAt(draft,at),'plain',at));
 };
 const is=(b:Brush)=>b.kind===brush.kind&&('id' in b&&'id' in brush?b.id===brush.id:true);
 const chip=(b:Brush,label:string,swatch:string,glyph:string)=><button type="button" key={b.kind+('id' in b?b.id:'')}
  className={'got-brush'+(is(b)?' is-selected':'')} aria-pressed={is(b)} onClick={()=>setBrush(b)}>
  <i style={{background:swatch}} aria-hidden="true">{glyph}</i>{label}</button>;
 const rules=brush.kind==='terrain'?warTerrainInfo(brush.id).label+': '+terrainRules(brush.id).join(' · '):
  brush.kind==='fort'?WAR_FORT_PROFILES[brush.id].label+' do '+SIDE[fortSide]+': '+fortRules(brush.id)+
   '. Só protege tropas do próprio lado que estiverem dentro dela.':
  brush.kind==='bridge'?'Ponte: abre a travessia de um rio (Movimento −10 m).':
  brush.kind==='road'?'Estrada: anula o terreno lento do quadrado.':
  'Borracha: volta o quadrado para planície e remove a construção.';
 return <div className="got-builder" onPointerUp={()=>{painting.current=false;}}
  onPointerLeave={()=>{painting.current=false;}}>
  <div className="got-builder-palette" role="group" aria-label="Peças do mapa">
   {GROUPS.map(group=><div key={group} className="got-builder-group">
    <span>{group}</span>
    {WAR_TERRAIN_CATALOG.filter(t=>t.group===group).map(t=>
     chip({kind:'terrain',id:t.id},t.label,t.color,t.glyph))}
    {group==='Campo'&&chip({kind:'road'},'Estrada sobre o terreno','#cbb388','═')}
    {group==='Água'&&chip({kind:'bridge'},'Ponte','#8a6a3a','╫')}
   </div>)}
   <div className="got-builder-group">
    <span>Construções</span>
    {FORT_KINDS.map(kind=>chip({kind:'fort',id:kind},
     WAR_FORT_PROFILES[kind].label+' +'+WAR_FORT_PROFILES[kind].defense,'#5b5750','♜'))}
    <label className="got-builder-side">de quem?
     <select aria-label="Lado da construção" value={fortSide}
      onChange={e=>setFortSide(e.target.value as WarSide)}>
      <option value="defender">Defensor</option><option value="attacker">Atacante</option>
     </select>
    </label>
    {chip({kind:'erase'},'Borracha','#d4c69e','✕')}
   </div>
  </div>
  <p className="got-builder-rules" role="status">{rules}</p>
  <div className="got-builder-grid" role="group" aria-label="Campo em construção"
   style={{gridTemplateColumns:'repeat('+draft.width+',minmax(0,1fr))'}}>
   {Array.from({length:draft.width*draft.height},(_,i)=>{
    const x=i%draft.width,y=Math.floor(i/draft.width),tile=tiles.get(x+':'+y);
    const terrain=tile?.terrain??'plain',fort=fortAt(draft,{x,y});
    const label=warTerrainInfo(terrain).label+(tile?.bridge?' com ponte':tile?.road?' com estrada':'')+
     (fort?' · '+WAR_FORT_PROFILES[fort.kind].label+' do '+SIDE[fort.side]:'');
    return <button type="button" key={i} aria-label={'Mapa '+x+','+y+' · '+label} title={label}
     data-fort={fort?.side} data-zone={x<3?'attacker':x>=draft.width-3?'defender':undefined}
     style={{backgroundColor:WAR_TERRAIN_COLORS[terrain]}}
     onPointerDown={e=>{painting.current=true;e.currentTarget.releasePointerCapture?.(e.pointerId);apply(x,y);}}
     onPointerEnter={()=>{if(painting.current)apply(x,y);}}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();apply(x,y);}}}>
     <span aria-hidden="true">{fort?'♜':tile?.bridge?'╫':tile?.road?'═':WAR_TERRAIN_GLYPHS[terrain]}</span>
    </button>;
   })}
  </div>
  <p className="battle-note">O Atacante entra pela esquerda e o Defensor pela direita (faixas marcadas).
   Tropas do dono de uma construção começam dentro dela, atiradores primeiro.</p>
 </div>;
}
