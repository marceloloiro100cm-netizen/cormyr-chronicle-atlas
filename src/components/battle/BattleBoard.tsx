import {useId,useRef,useState} from 'react';
import type { BattleMap, BattleStack, Hex, Side } from '@/lib/battle/domain/types';
import { hexKey } from '@/lib/battle/geometry/hex';
import { gridKind,gridToOffset } from '@/lib/battle/geometry/grid';
import { militaryUnitSymbolSrc } from '@/components/house/military-unit-symbol';
import {BattleSquareLegend} from './BattleSquareLegend';
import {SQUARE_TERRAIN_PRESENTATION,SQUARE_SIDE_PRESENTATION} from '@/lib/battle/geometry/square-presentation';
import { livingCount } from '@/lib/battle/domain/morale';

type Token=Pick<BattleStack,'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'>;
const TERRAIN_COLOR={
 plain:SQUARE_TERRAIN_PRESENTATION.plain.color,forest:SQUARE_TERRAIN_PRESENTATION.forest.color,
 hill:SQUARE_TERRAIN_PRESENTATION.hill.color,rock:SQUARE_TERRAIN_PRESENTATION.rock.color,
} as const;
const SIDE_COLOR:Record<Side,string>={
 attacker:SQUARE_SIDE_PRESENTATION.attacker.color,
 defender:SQUARE_SIDE_PRESENTATION.defender.color,
};
const SIZE=30;
const XSTEP=Math.sqrt(3)*SIZE;
const SQUARE_STEP=SIZE*2.1;
const points=Array.from({length:6},(_,i)=>{
  const a=(-90+60*i)*Math.PI/180;
  return (SIZE*Math.cos(a)).toFixed(2)+','+(SIZE*Math.sin(a)).toFixed(2);
}).join(' ');
const pixel=(map:BattleMap,h:Hex)=>{const {column,row}=gridToOffset(map,h);return gridKind(map)==='square'?
  {x:SQUARE_STEP*(column+0.75),y:SQUARE_STEP*(row+0.75)}:
  {x:SIZE*1.3+XSTEP*(column+(row&1)/2),y:SIZE*1.25+SIZE*1.5*row};
};
export function BattleBoard({map,stacks=[],selectedId,activeId,hoveredId,moveKeys=[],attackKeys=[],pendingHex,
  showZones=false,onHexClick,onHoverHex,theme='standard',objectivePosition,objectivePositions=[]}:{
  map:BattleMap;stacks?:readonly Token[];selectedId?:string|null;activeId?:string|null;
  hoveredId?:string|null;theme?:'standard'|'cormyr';
  moveKeys?:readonly string[];attackKeys?:readonly string[];pendingHex?:Hex|null;
  showZones?:boolean;objectivePosition?:Hex|undefined;objectivePositions?:readonly Hex[]|undefined;
  onHexClick?:(hex:Hex)=>void;onHoverHex?:(hex:Hex|null)=>void;
}){
  const [zoom,setZoom]=useState(100);
  const svgRef=useRef<SVGSVGElement>(null);
  const helpId=useId();
  const [focusKey,setFocusKey]=useState(()=>hexKey(map.tiles[0]??{q:0,r:0}));
  const accessibleFocusKey=map.tiles.some(tile=>hexKey(tile)===focusKey)?
   focusKey:hexKey(map.tiles[0]??{q:0,r:0});
  const navigateKeyboard=(tile:Hex,key:string)=>{
   const offset=gridToOffset(map,tile);
   const delta=key==='ArrowLeft'?{x:-1,y:0}:key==='ArrowRight'?{x:1,y:0}:
    key==='ArrowUp'?{x:0,y:-1}:key==='ArrowDown'?{x:0,y:1}:null;
   if(!delta)return false;
   const next=map.tiles.find(h=>{
    const at=gridToOffset(map,h);
    return at.column===offset.column+delta.x&&at.row===offset.row+delta.y;
   });
   if(next){
    const nextKey=hexKey(next);
    setFocusKey(nextKey);
    svgRef.current?.querySelector<SVGElement>('[data-battle-hex="'+nextKey+'"]')?.focus?.();
   }
   return true;
  };
  const colors=SIDE_COLOR;
  const square=gridKind(map)==='square';
  const tileMap=new Map(map.tiles.map(t=>[hexKey(t),t]));
  // Pilhas destruídas ou em debandada saem do campo; seguem no estado para baixas e relatório.
  const occupied=new Map(stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed')
    .map(s=>[hexKey(s.position),s]));
  const a=new Set(map.deployment.attacker.map(hexKey)),b=new Set(map.deployment.defender.map(hexKey));
  const move=new Set(moveKeys),attack=new Set(attackKeys);
  const w=square?SQUARE_STEP*(map.width+1.5):XSTEP*(map.width+1)+SIZE*1.6;
  const h=square?SQUARE_STEP*(map.height+1.5):SIZE*(1.5*(map.height-1)+2.8);
  return <div className="battle-board-frame">
    <div className="battle-zoom-controls" role="group" aria-label="Ampliação do mapa">
      <button type="button" aria-label="Reduzir zoom do mapa" disabled={zoom<=100} onClick={()=>setZoom(v=>Math.max(100,v-50))}>−</button>
      <output aria-label="Zoom atual do mapa" aria-live="polite">{zoom}%</output>
      <button type="button" aria-label="Ampliar zoom do mapa" disabled={zoom>=250} onClick={()=>setZoom(v=>Math.min(250,v+50))}>+</button>
      <button type="button" aria-label="Restaurar zoom do mapa" disabled={zoom===100} onClick={()=>setZoom(100)}>Ajustar</button>
    </div>
    <div className="battle-board-scroll" role="region" tabIndex={0} aria-label={square?'Área navegável do mapa quadrado':'Área navegável do mapa hexagonal'}>
    <svg ref={svgRef} className={'battle-board-svg'+(theme==='cormyr'?' battle-board-svg--cormyr':'')} viewBox={`0 0 ${w} ${h}`} style={{width:`${zoom}%`,maxWidth:'none'}}
      role="group" aria-label={`Mapa ${square?'quadrado':'hexagonal'} com ${map.width} colunas por ${map.height} linhas`}>
      {map.tiles.map(tile=>{
        const key=hexKey(tile),pos=pixel(map,tile),unit=occupied.get(key);
        const isSelected=unit?.id===selectedId,isActive=unit?.id===activeId;
        const isHovered=unit?.id===hoveredId;
        const isPending=pendingHex&&hexKey(pendingHex)===key;
        const legalMove=move.has(key),legalAttack=Boolean(unit&&attack.has(unit.id));
        const isA=showZones&&a.has(key),isB=showZones&&b.has(key);
        const mark=militaryUnitSymbolSrc(unit?.primaryTypeId);
        const isGoal=Boolean((objectivePosition&&hexKey(objectivePosition)===key)||
         objectivePositions.some(pos=>hexKey(pos)===key));
        const count=unit?Math.min(unit.initialCount,Math.ceil(unit.currentHp/unit.hpPerSoldier)):0;
        const label=`${square?'Quadrado':'Hexágono'} ${tile.q}, ${tile.r}; ${tile.terrain==='plain'?'planície':tile.terrain==='forest'?'floresta':tile.terrain==='hill'?'colina':'rocha'}${unit?'; '+unit.name+', '+count+' combatentes':''}${legalMove?'; movimento permitido':''}${legalAttack?'; alvo válido':''}${isGoal?'; objetivo da batalha':''}`;
        return <g key={key} transform={`translate(${pos.x},${pos.y})`}
          data-battle-hex={key} role="button"
          tabIndex={onHexClick?(key===accessibleFocusKey?0:-1):undefined}
          aria-label={label} aria-describedby={onHexClick?helpId:undefined}
          onClick={()=>onHexClick?.({q:tile.q,r:tile.r})}
          onMouseEnter={()=>onHoverHex?.({q:tile.q,r:tile.r})}
          onMouseLeave={()=>onHoverHex?.(null)}
          onFocus={()=>{setFocusKey(key);onHoverHex?.({q:tile.q,r:tile.r});}}
          onKeyDown={e=>{
           if(!onHexClick)return;
           if(e.key==='Enter'||e.key===' '){
            e.preventDefault();onHexClick({q:tile.q,r:tile.r});
           }else if(navigateKeyboard(tile,e.key))e.preventDefault();
          }}
          className={`battle-hex${onHexClick?' battle-hex--interactive':''}`}>
          <title>{label}</title>
          {square?<rect data-battle-cell-shape="square" x={-SQUARE_STEP/2} y={-SQUARE_STEP/2}
            width={SQUARE_STEP} height={SQUARE_STEP} fill={TERRAIN_COLOR[tile.terrain]}
            stroke={isPending?'#f7f4ba':isSelected?(theme==='cormyr'?'#84ff92':'#fff5c2'):legalAttack?'#e9574c':legalMove?'#72e881':'#524b43'}
            strokeWidth={isPending||isSelected||legalAttack?4:legalMove?3:1.25}/>:
          <polygon data-battle-cell-shape="hex" points={points} fill={TERRAIN_COLOR[tile.terrain]}
            stroke={isPending?'#f7f4ba':isSelected?(theme==='cormyr'?'#84ff92':'#fff5c2'):legalAttack?'#e9574c':legalMove?'#72e881':'#524b43'}
            strokeWidth={isPending||isSelected||legalAttack?4:legalMove?3:1.25}/>}
          {(isA||isB)&&<circle r="23" stroke={isA?colors.attacker:colors.defender} strokeWidth="1.8" fill="none" strokeDasharray="4 3"/>}
          {isGoal&&<g className="battle-goal-marker" aria-label="Objetivo" aria-hidden="true">
           <circle cx="20" cy="-20" r="12" fill="#3e3525" stroke="#ffdc81" strokeWidth="2.5"/>
           <text x="20" y="-16" fontSize="13" fill="#fff6dc" fontWeight="700" textAnchor="middle">★</text>
          </g>}
          {tile.terrain==='forest'&&!unit&&<text textAnchor="middle" y="6" fontSize="21" fill="#e3efe1" aria-hidden="true">♣</text>}
          {tile.terrain==='hill'&&!unit&&<text textAnchor="middle" y="6" fontSize="18" fill="#674923" aria-hidden="true">▲</text>}
          {tile.terrain==='rock'&&!unit&&<text textAnchor="middle" y="6" fontSize="19" fill="#e9e8e4" aria-hidden="true">◆</text>}
          {unit&&<>
            {isHovered&&<circle data-battle-hover-ring={unit.id} r="29"
              stroke="#ffe29a" strokeWidth="4.5" fill="none" pointerEvents="none"/>}
            {isSelected&&theme==='cormyr'&&<circle data-battle-selected-ring={unit.id} r="25"
              stroke="#7eff9a" strokeWidth="4" fill="none" pointerEvents="none"/>}
            {legalAttack&&theme==='cormyr'&&<circle data-battle-attack-ring={unit.id} r="27"
              stroke="#ff685e" strokeWidth="4" fill="none" pointerEvents="none"/>}
            <circle r="20" fill={colors[unit.side]} stroke={isActive?'#f6e58c':'#faf7eb'} strokeWidth={isActive?3:1.8}/>
            <rect x="-18" y="-22" width="36" height="36" rx="7" fill="#17242a"
              stroke={colors[unit.side]} strokeWidth="1.5" pointerEvents="none"/>
            {mark?<image href={mark} x="-16" y="-20" width="32" height="32"
              preserveAspectRatio="xMidYMid meet" pointerEvents="none"/>:
              <text y="-2" fontSize="11" textAnchor="middle" fontWeight="bold" fill="#fff"
               pointerEvents="none">{unit.name.slice(0,2).toUpperCase()}</text>}
            <rect x="-23" y="11" width="46" height="15" rx="7" fill="#211d1d"/>
            <text x="0" y="22" fontSize="12" textAnchor="middle" fill="#fff" fontWeight="bold">{count}</text>
            <rect x="-22" y="27" width="44" height="5" rx="2" fill="#201b1b"/>
            <rect x="-22" y="27" width={44*Math.max(0,Math.min(1,unit.currentHp/(unit.initialCount*unit.hpPerSoldier)))}
              height="5" rx="2" fill={unit.currentHp/(unit.initialCount*unit.hpPerSoldier)<.3?'#e47b60':'#b5d891'}/>
            {unit.moraleState==='routed'&&<text x="18" y="-18" fontSize="16" fill="#fff">!</text>}
          </>}
        </g>;
      })}
    </svg>
    </div>
    {square&&<BattleSquareLegend/>}
    {square&&<p className="battle-board-cost-note">Adaptado: Floresta e Colina têm custo 2; Rocha bloqueia a passagem.</p>}
    <span id={helpId} className="sr-only">Use Tab para entrar no mapa, setas para navegar pelos células,
      Enter ou Espaço para selecionar o destino.</span>
    <span className="sr-only">{tileMap.size} células disponíveis; use Tab e Enter para selecionar.</span>
  </div>;
}
