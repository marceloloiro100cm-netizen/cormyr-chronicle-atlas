import {useId,useState} from 'react';
import type { BattleMap, BattleStack, Hex, Side } from '@/lib/battle/domain/types';
import { axialToOffset, hexKey } from '@/lib/battle/geometry/hex';
import { militaryUnitSymbolSrc } from '@/components/house/military-unit-symbol';
import { livingCount } from '@/lib/battle/domain/morale';
import {v38TheatreFromMap,v38DecorationFor} from '@/lib/battle/v3/theatres-v38';
import {BattleV38Decor} from './BattleV38Decor';

type Token=Pick<BattleStack,'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'>;
const TERRAIN_COLOR={plain:'#d4c69e',forest:'#66886b',hill:'#c4a36f',rock:'#787478'} as const;
const SIDE_COLOR:Record<Side,string>={attacker:'#b9524d',defender:'#426e9e'};
export type BattleBoardAppearance='classic'|'illustrated'|'contrast';
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
  showZones=false,onHexClick,onHoverHex,appearance='classic'}:{
  map:BattleMap;stacks?:readonly Token[];selectedId?:string|null;activeId?:string|null;
  moveKeys?:readonly string[];attackKeys?:readonly string[];pendingHex?:Hex|null;
  showZones?:boolean;onHexClick?:(hex:Hex)=>void;onHoverHex?:(hex:Hex|null)=>void;
  appearance?:BattleBoardAppearance;
}){
  const [zoom,setZoom]=useState(100);
  const gradientId=useId().replace(/:/g,'');
  const illustrated=appearance==='illustrated',contrast=appearance==='contrast';
  const theatre=v38TheatreFromMap(map);
  const sides=illustrated||contrast?{attacker:'#356ba1',defender:'#a64242'}:SIDE_COLOR;
  const terrainColor=contrast?{plain:'#d7d7c7',forest:'#286b38',hill:'#a47b2c',rock:'#464c57'}:TERRAIN_COLOR;
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
    <svg className={'battle-board-svg'+(illustrated?' battlefield-illustrated':'')+(contrast?' battlefield-contrast':'')}
      viewBox={`0 0 ${w} ${h}`} style={{width:`${zoom}%`,maxWidth:'none'}}
      role="group" aria-label={`Mapa hexagonal com ${map.width} colunas por ${map.height} linhas`}>
      <defs>
       <linearGradient id={gradientId+'-plain'} x1="0" y1="0" x2=".9" y2="1">
        <stop offset="0%" stopColor={theatre?.accent??"#b3ad80"}/><stop offset="53%" stopColor={theatre?.earth??"#817f5e"}/>
        <stop offset="100%" stopColor={theatre?.sky??"#686d53"}/>
       </linearGradient>
       <linearGradient id={gradientId+'-forest'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={theatre?.forest??"#55705b"}/><stop offset="100%" stopColor={theatre?.sky??"#253c35"}/>
       </linearGradient>
       <linearGradient id={gradientId+'-hill'} x1="0" y1="0" x2=".85" y2="1">
        <stop offset="0%" stopColor={theatre?.hill??"#bd9367"}/><stop offset="100%" stopColor={theatre?.earth??"#68513e"}/>
       </linearGradient>
       <linearGradient id={gradientId+'-rock'} x1="0" y1="0" x2=".8" y2="1">
        <stop offset="0%" stopColor={theatre?.rock??"#a39a8b"}/><stop offset="100%" stopColor={theatre?.sky??"#494d4b"}/>
       </linearGradient>
       <radialGradient id={gradientId+'-board'} cx="47%" cy="44%" r="73%">
        <stop offset="0%" stopColor={theatre?.earth??"#505947"}/><stop offset="85%" stopColor={theatre?.sky??"#303c33"}/>
        <stop offset="100%" stopColor="#1a2926"/>
       </radialGradient>
       <filter id={gradientId+'-halo'} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="3.5"/>
       </filter>
      </defs>
      {(illustrated||contrast)&&<rect x="0" y="0" width={w} height={h}
       fill={illustrated?`url(#${gradientId}-board)`:'#141c23'}/>}
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
          <polygon points={points}
            fill={illustrated?`url(#${gradientId}-${tile.terrain})`:terrainColor[tile.terrain]}
            stroke={isPending?'#f7f4ba':isSelected?'#fff5c2':legalAttack?'#ff6665':legalMove?'#8bdda0':contrast?'#0a0f17':illustrated?'#3b4737':'#524b43'}
            strokeWidth={isPending||isSelected||legalAttack?4:legalMove?3:1.25}/>
          {illustrated&&<g aria-hidden="true" pointerEvents="none">
            {tile.terrain==='plain'&&<>
             <path d="M-18 10 l4 -3 2 -7 M4 17 l3 -5 2 2 M15 -8 l3 -3"
              fill="none" stroke="#e3d4a1" strokeWidth="1.3" opacity=".29"/>
             <circle cx="-10" cy="-17" r="1.2" fill="#4d5844" opacity=".35"/>
            </>}
            {tile.terrain==='forest'&&<>
             <ellipse cx="0" cy="16" rx="22" ry="5" fill="#0e241c" opacity=".55"/>
             <path d="M-16 6 l8 -23 8 23 Z M0 12 l10 -29 11 29 Z"
              fill="#183b2d" stroke="#73946d" strokeWidth="1.3"/>
             <path d="M-7 5 l6 -16 6 16 Z" fill="#37684b"/>
             <path d="M10 6 v11" stroke="#59422e" strokeWidth="2.7"/>
            </>}
            {tile.terrain==='hill'&&<>
             <path d="M-25 17 Q-14 3 -3 -9 L6 0 18 -13 27 17 Z" fill="#5c4f3e"
              stroke="#deb88b" strokeWidth=".9"/>
             <path d="M-9 -2 l6 -7 6 7 M13 -5 l5 -8 6 9"
              fill="none" stroke="#e8d6b0" strokeWidth="1.7" opacity=".65"/>
            </>}
            {tile.terrain==='rock'&&<>
             <path d="M-25 16 l-4 -12 11 -16 16 5 8 20 -11 11 Z"
              fill="#53595a" stroke="#b0ada3" strokeWidth="1.4"/>
             <path d="M-5 17 l3 -20 18 -15 14 12 -2 19 -15 12 Z"
              fill="#7c807c" stroke="#c6c2b1" strokeWidth="1.3"/>
             <path d="M-2 -3 l14 3 -4 9 9 7" stroke="#444c4e" fill="none" strokeWidth="1.3"/>
            </>}
           </g>}
          {illustrated&&theatre&&<BattleV38Decor kind={v38DecorationFor(map,tile)}/>}
          {(legalMove||legalAttack)&&<polygon points={points} fill={legalMove?'#75dc83':'#f57a65'}
            opacity={contrast?'.36':'.18'} pointerEvents="none"/>}
          {(isA||isB)&&<circle r="23" stroke={isA?sides.attacker:sides.defender} strokeWidth="1.8" fill="none" strokeDasharray="4 3"/>}
          {!illustrated&&tile.terrain==='forest'&&!unit&&<text textAnchor="middle" y="6" fontSize="21" fill="#e3efe1" aria-hidden="true">♣</text>}
          {!illustrated&&tile.terrain==='hill'&&!unit&&<text textAnchor="middle" y="6" fontSize="18" fill="#674923" aria-hidden="true">▲</text>}
          {!illustrated&&tile.terrain==='rock'&&!unit&&<text textAnchor="middle" y="6" fontSize="19" fill="#e9e8e4" aria-hidden="true">◆</text>}
          {unit&&<>
            {(illustrated||contrast)&&<>
             <ellipse cx="1" cy="15" rx="23" ry="8" fill="#0f1916" opacity=".55"/>
             {isActive&&<circle r="25" fill="#f3d590" opacity=".57"
              filter={`url(#${gradientId}-halo)`}/>}
            </>}
            <circle r="20" fill={sides[unit.side]} stroke={isActive?'#ffe6a0':isSelected?'#fff0bd':'#f4ecd5'}
             strokeWidth={isActive?4:isSelected?3:1.8}/>
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
    {theatre&&<div className="crusade-v38-map-ribbon" role="note">
     <strong>{theatre.icon} {theatre.name}</strong><span>{theatre.subtitle} · Ambiente fictício de treino</span>
    </div>}
    <div className="battle-board-legend" aria-label="Legenda do campo">
      <span>▱ Planície</span><span>♣ Floresta · custo 2</span><span>▲ Colina · custo 2</span>
      <span>◆ Rocha · bloqueio</span><span>Contorno verde: movimento</span><span>Contorno vermelho: alvo</span>
    </div>
    <span className="sr-only">{tileMap.size} hexágonos disponíveis; use Tab e Enter para selecionar.</span>
  </div>;
}
