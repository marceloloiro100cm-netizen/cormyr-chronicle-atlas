import {useState} from 'react';
import type { BattleMap, BattleStack, Hex, Side } from '@/lib/battle/domain/types';
import { axialToOffset, hexKey } from '@/lib/battle/geometry/hex';
import { militaryUnitSymbolSrc } from '@/components/house/military-unit-symbol';
import { livingCount } from '@/lib/battle/domain/morale';

type Token=Pick<BattleStack,'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'>;
const TERRAIN_COLOR={plain:'#d4c69e',forest:'#66886b',hill:'#c4a36f',rock:'#787478'} as const;
const SIDE_COLOR:Record<Side,string>={attacker:'#b9524d',defender:'#426e9e'};
const SIZE=30;
const XSTEP=Math.sqrt(3)*SIZE;
const points=Array.from({length:6},(_,i)=>{
  const a=(-90+60*i)*Math.PI/180;
  return (SIZE*Math.cos(a)).toFixed(2)+','+(SIZE*Math.sin(a)).toFixed(2);
}).join(' ');
const pixel=(h:Hex)=>{const {column,row}=axialToOffset(h);return {
  x:SIZE*1.3+XSTEP*(column+(row&1)/2),
  y:SIZE*1.25+SIZE*1.5*row,
};};
export function BattleBoard({map,stacks=[],selectedId,activeId,moveKeys=[],attackKeys=[],pendingHex,
  showZones=false,onHexClick,onHoverHex}:{
  map:BattleMap;stacks?:readonly Token[];selectedId?:string|null;activeId?:string|null;
  moveKeys?:readonly string[];attackKeys?:readonly string[];pendingHex?:Hex|null;
  showZones?:boolean;onHexClick?:(hex:Hex)=>void;onHoverHex?:(hex:Hex|null)=>void;
}){
  const [zoom,setZoom]=useState(100);
  const tileMap=new Map(map.tiles.map(t=>[hexKey(t),t]));
  const occupied=new Map(stacks.filter(s=>s.currentHp>0).map(s=>[hexKey(s.position),s]));
  const a=new Set(map.deployment.attacker.map(hexKey)),b=new Set(map.deployment.defender.map(hexKey));
  const move=new Set(moveKeys),attack=new Set(attackKeys);
  const w=XSTEP*(map.width+1)+SIZE*1.6,h=SIZE*(1.5*(map.height-1)+2.8);
  return <div className="battle-board-frame">
    <div className="battle-zoom-controls" role="group" aria-label="Ampliação do mapa">
      <button type="button" aria-label="Reduzir zoom do mapa" disabled={zoom<=100} onClick={()=>setZoom(v=>Math.max(100,v-50))}>−</button>
      <output aria-label="Zoom atual do mapa" aria-live="polite">{zoom}%</output>
      <button type="button" aria-label="Ampliar zoom do mapa" disabled={zoom>=250} onClick={()=>setZoom(v=>Math.min(250,v+50))}>+</button>
      <button type="button" aria-label="Restaurar zoom do mapa" disabled={zoom===100} onClick={()=>setZoom(100)}>Ajustar</button>
    </div>
    <div className="battle-board-scroll" role="region" tabIndex={0} aria-label="Área navegável do mapa hexagonal">
    <svg className="battle-board-svg" viewBox={`0 0 ${w} ${h}`} style={{width:`${zoom}%`,maxWidth:'none'}}
      role="group" aria-label={`Mapa hexagonal com ${map.width} colunas por ${map.height} linhas`}>
      {map.tiles.map(tile=>{
        const key=hexKey(tile),pos=pixel(tile),unit=occupied.get(key);
        const isSelected=unit?.id===selectedId,isActive=unit?.id===activeId;
        const isPending=pendingHex&&hexKey(pendingHex)===key;
        const legalMove=move.has(key),legalAttack=Boolean(unit&&attack.has(unit.id));
        const isA=showZones&&a.has(key),isB=showZones&&b.has(key);
        const mark=militaryUnitSymbolSrc(unit?.primaryTypeId);
        const count=unit?Math.min(unit.initialCount,Math.ceil(unit.currentHp/unit.hpPerSoldier)):0;
        const label=`Hexágono ${tile.q}, ${tile.r}; ${tile.terrain==='plain'?'planície':tile.terrain==='forest'?'floresta':tile.terrain==='hill'?'colina':'rocha'}${unit?'; '+unit.name+', '+count+' combatentes':''}${legalMove?'; movimento permitido':''}${legalAttack?'; alvo válido':''}`;
        return <g key={key} transform={`translate(${pos.x},${pos.y})`}
          role="button" tabIndex={onHexClick?0:undefined} aria-label={label}
          onClick={()=>onHexClick?.({q:tile.q,r:tile.r})}
          onMouseEnter={()=>onHoverHex?.({q:tile.q,r:tile.r})}
          onMouseLeave={()=>onHoverHex?.(null)}
          onFocus={()=>onHoverHex?.({q:tile.q,r:tile.r})}
          onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&onHexClick){e.preventDefault();onHexClick({q:tile.q,r:tile.r});}}}
          className={`battle-hex${onHexClick?' battle-hex--interactive':''}`}>
          <title>{label}</title>
          <polygon points={points} fill={TERRAIN_COLOR[tile.terrain]}
            stroke={isPending?'#f7f4ba':isSelected?'#fff5c2':legalAttack?'#b62029':legalMove?'#3d9c5b':'#524b43'}
            strokeWidth={isPending||isSelected||legalAttack?4:legalMove?3:1.25}/>
          {(isA||isB)&&<circle r="23" stroke={isA?SIDE_COLOR.attacker:SIDE_COLOR.defender} strokeWidth="1.8" fill="none" strokeDasharray="4 3"/>}
          {tile.terrain==='forest'&&!unit&&<text textAnchor="middle" y="6" fontSize="21" fill="#e3efe1" aria-hidden="true">♣</text>}
          {tile.terrain==='hill'&&!unit&&<text textAnchor="middle" y="6" fontSize="18" fill="#674923" aria-hidden="true">▲</text>}
          {tile.terrain==='rock'&&!unit&&<text textAnchor="middle" y="6" fontSize="19" fill="#e9e8e4" aria-hidden="true">◆</text>}
          {unit&&<>
            <circle r="20" fill={SIDE_COLOR[unit.side]} stroke={isActive?'#f6e58c':'#faf7eb'} strokeWidth={isActive?3:1.8}/>
            {mark?<image href={mark} x="-16" y="-19" width="32" height="32" preserveAspectRatio="xMidYMid slice"/>:
              <text y="3" fontSize="13" textAnchor="middle" fontWeight="bold" fill="#fff">{unit.name.slice(0,2).toUpperCase()}</text>}
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
    <div className="battle-board-legend" aria-label="Legenda do campo">
      <span>▱ Planície</span><span>♣ Floresta · custo 2</span><span>▲ Colina · custo 2</span>
      <span>◆ Rocha · bloqueio</span><span>Contorno verde: movimento</span><span>Contorno vermelho: alvo</span>
    </div>
    <span className="sr-only">{tileMap.size} hexágonos disponíveis; use Tab e Enter para selecionar.</span>
  </div>;
}
