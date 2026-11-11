import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {militaryUnitSymbolSrc} from '@/components/house/military-unit-symbol';
import type {WarBattle,WarPosition,WarUnit} from '@/lib/battle/got/types';
import type {WarTargetOption} from '@/lib/battle/got/command-preview';
import {formatWarChance} from '@/lib/battle/got/odds';
import './battle-got-board.css';

/** Tabuleiro tático 2D do modo Game of Thrones.
 * Camada puramente visual: os quadrados continuam sendo os botões acessíveis
 * e as peças ficam numa camada sobreposta para poderem deslizar, investir e
 * mostrar dano. Nenhuma regra é decidida aqui; tudo chega por propriedades.
 */
export type BoardAction=Readonly<{
 /** Muda a cada ordem resolvida, para disparar a animação uma única vez. */
 seq:number;actorId:string;targetId?:string;
 kind:'attack'|'shoot'|'charge'|'move'|'other';
 /** Rota percorrida, do quadrado de origem ao destino, quando houver. */
 path?:readonly WarPosition[];
}>;
type Floater={key:number;x:number;y:number;text:string;tone:'damage'|'heal'|'state'};
type Ghost={key:number;unit:WarUnit};
const CONDITION_LABEL:Record<WarUnit['condition'],string>={
 organized:'Organizada',disorganized:'Desorganizada',routed:'Debandada',
 destroyed:'Destruída',surrendered:'Rendida',escaped:'Fora de campo',
};
const STANDING_ICON:Partial<Record<string,string>>={
 attack:'⚔',charge:'⚔',defend:'🛡',retreat:'↩','aggressive-retreat':'↩',ready:'👁',push:'⚔',
};
const fieldable=(u:WarUnit):boolean=>!['destroyed','escaped','surrendered'].includes(u.condition);
const reducedMotion=():boolean=>typeof window!=='undefined'&&
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const GAP=2;
const leftOf=(x:number,width:number)=>'calc('+x+' * (100% + '+GAP+'px) / '+width+')';
const topOf=(y:number,height:number)=>'calc('+y+' * (100% + '+GAP+'px) / '+height+')';
const sizeOf=(count:number)=>'calc((100% - '+(count-1)*GAP+'px) / '+count+')';

export function BattleGotBoard({battle,terrainColors,selectedId,targetId,destination,
 routeKeys,reachable,targets,needs,lastAction,conditionNames=CONDITION_LABEL,onCell}:{
 battle:WarBattle;
 terrainColors:Readonly<Record<string,string>>;
 selectedId:string|null;targetId:string|null;destination:WarPosition;
 routeKeys:ReadonlySet<string>;
 /** Quadrados alcançáveis pela ordem escolhida (chave "x:y"). */
 reachable:ReadonlySet<string>;
 /** Inimigos que a ordem escolhida pode atingir. */
 targets:ReadonlyMap<string,WarTargetOption>;
 needs:'enemy'|'cell'|'none'|null;
 lastAction:BoardAction|null;
 conditionNames?:Readonly<Record<WarUnit['condition'],string>>;
 onCell:(x:number,y:number)=>void;
}){
 const units=useMemo(()=>battle.units.filter(fieldable),[battle.units]);
 const terrain=useMemo(()=>new Map(battle.tiles.map(t=>[t.x+':'+t.y,t.terrain] as const)),[battle.tiles]);
 const occupants=useMemo(()=>new Map(units.map(u=>[u.position.x+':'+u.position.y,u] as const)),[units]);
 const [floaters,setFloaters]=useState<Floater[]>([]);
 const [ghosts,setGhosts]=useState<Ghost[]>([]);
 const [shaking,setShaking]=useState<ReadonlySet<string>>(new Set());
 const previous=useRef<Map<string,WarUnit>|null>(null);
 const counter=useRef(0);
 const tokenRefs=useRef(new Map<string,HTMLDivElement>());
 const animatedSeq=useRef(0);
 // Diferenças entre o estado anterior e o atual viram efeitos visuais passageiros.
 useEffect(()=>{
  const before=previous.current;
  previous.current=new Map(battle.units.map(u=>[u.id,u]));
  if(!before)return undefined;
  const notes:Floater[]=[],gone:Ghost[]=[],hit=new Set<string>();
  for(const unit of battle.units){
   const old=before.get(unit.id);
   if(!old)continue;
   const at=fieldable(unit)?unit.position:old.position;
   if(unit.health<old.health||(old.condition!==unit.condition&&
    ['disorganized','routed','destroyed'].includes(unit.condition)&&
    !(old.condition==='routed'&&unit.condition==='disorganized'))){
    hit.add(unit.id);
    const lost=old.health-unit.health;
    if(lost>0)notes.push({key:++counter.current,x:at.x,y:at.y,text:'−'+lost,tone:'damage'});
   }else if(unit.health>old.health){
    notes.push({key:++counter.current,x:at.x,y:at.y,text:'+'+(unit.health-old.health),tone:'heal'});
   }
   if(old.condition!==unit.condition&&unit.condition!=='organized')
    notes.push({key:++counter.current,x:at.x,y:at.y,
     text:conditionNames[unit.condition],tone:'state'});
   if(fieldable(old)&&!fieldable(unit))gone.push({key:++counter.current,unit:{...unit,position:old.position}});
  }
  if(!notes.length&&!gone.length&&!hit.size)return undefined;
  setFloaters(list=>[...list,...notes].slice(-12));
  setGhosts(list=>[...list,...gone].slice(-8));
  setShaking(hit);
  const keys=new Set([...notes.map(n=>n.key),...gone.map(g=>g.key)]);
  const timer=window.setTimeout(()=>{
   setFloaters(list=>list.filter(n=>!keys.has(n.key)));
   setGhosts(list=>list.filter(g=>!keys.has(g.key)));
   setShaking(new Set());
  },1500);
  return()=>window.clearTimeout(timer);
 },[battle.units,conditionNames]);
 // Marcha pela rota real e investida contra o alvo.
 useLayoutEffect(()=>{
  if(!lastAction||lastAction.seq===animatedSeq.current)return;
  animatedSeq.current=lastAction.seq;
  if(reducedMotion())return;
  const node=tokenRefs.current.get(lastAction.actorId);
  if(!node||typeof node.animate!=='function')return;
  const path=lastAction.path??[];
  let travel=0;
  if(path.length>1){
   travel=Math.min(1400,Math.max(320,(path.length-1)*170));
   node.animate(path.map(p=>({left:leftOf(p.x,battle.width),top:topOf(p.y,battle.height)})),
    {duration:travel,easing:'linear'});
  }
  const victim=lastAction.targetId?battle.units.find(u=>u.id===lastAction.targetId):null;
  const actor=battle.units.find(u=>u.id===lastAction.actorId);
  const body=node.firstElementChild as HTMLElement|null;
  if(victim&&actor&&body&&typeof body.animate==='function'&&lastAction.kind!=='shoot'){
   const dx=Math.sign(victim.position.x-actor.position.x)*38;
   const dy=Math.sign(victim.position.y-actor.position.y)*38;
   body.animate([{transform:'translate(0,0)'},{transform:'translate('+dx+'%,'+dy+'%)'},
    {transform:'translate(0,0)'}],{duration:380,delay:travel,easing:'ease-in-out'});
  }
 },[lastAction,battle.units,battle.width,battle.height]);
 const arrow=lastAction?.kind==='shoot'&&lastAction.targetId?(()=>{
  const from=battle.units.find(u=>u.id===lastAction.actorId);
  const to=battle.units.find(u=>u.id===lastAction.targetId);
  return from&&to?{from:from.position,to:to.position,key:lastAction.seq}:null;
 })():null;
 const renderToken=(unit:WarUnit,ghost=false)=>{
  const src=militaryUnitSymbolSrc(unit.typeId);
  const ratio=unit.maxHealth?Math.max(0,Math.min(1,unit.health/unit.maxHealth)):0;
  const option=targets.get(unit.id);
  const standing=unit.standing?STANDING_ICON[unit.standing.kind]:undefined;
  return <div key={(ghost?'ghost-':'')+unit.id} aria-hidden="true"
   ref={ghost?undefined:node=>{if(node)tokenRefs.current.set(unit.id,node);
    else tokenRefs.current.delete(unit.id);}}
   className={'got-tok '+unit.side+' is-'+unit.condition+
    (ghost?' is-leaving':'')+
    (!ghost&&unit.id===selectedId?' is-selected':'')+
    (!ghost&&unit.id===targetId?' is-target':'')+
    (!ghost&&option?' is-attackable':'')+
    (!ghost&&shaking.has(unit.id)?' is-hit':'')+
    (!ghost&&unit.side===battle.turn&&battle.phase==='orders'?' is-turn':'')}
   style={{left:leftOf(unit.position.x,battle.width),top:topOf(unit.position.y,battle.height),
    width:sizeOf(battle.width),height:sizeOf(battle.height)}}>
   <div className="got-tok-body">
    <span className="got-tok-crest">
     {src?<img src={src} alt="" loading="lazy" draggable={false}/>:
      <strong>{unit.side==='attacker'?'A':'D'}</strong>}
    </span>
    <span className="got-tok-name">{unit.name.split(' ')[0]}</span>
    <span className="got-tok-hp"><i style={{width:Math.round(ratio*100)+'%'}}
     data-level={ratio>0.6?'high':ratio>0.3?'mid':'low'}/></span>
    {unit.condition==='disorganized'&&<span className="got-tok-badge" title="Desorganizada">!</span>}
    {unit.condition==='routed'&&<span className="got-tok-badge is-rout" title="Debandada">🏳</span>}
    {standing&&unit.condition!=='routed'&&<span className="got-tok-order"
     title="Ordem contínua">{standing}</span>}
    {unit.defendRoll!==null&&<span className="got-tok-shield">{unit.defendRoll}</span>}
    {battle.advancedFormations&&unit.facing&&<span className="got-tok-facing">
     {({north:'↑',east:'→',south:'↓',west:'←'} as const)[unit.facing]}</span>}
    {option?.odds&&<span className="got-tok-odds">{formatWarChance(option.odds.success)}</span>}
   </div>
  </div>;
 };
 return <div className={'got-map got-board'+(needs?' needs-'+needs:'')}
  style={{gridTemplateColumns:'repeat('+battle.width+',minmax(0,1fr))'}}>
  {Array.from({length:battle.width*battle.height},(_,i)=>{
   const x=i%battle.width,y=Math.floor(i/battle.width),key=x+':'+y;
   const occupant=occupants.get(key);
   const kind=terrain.get(key)??'plain';
   const isDestination=destination.x===x&&destination.y===y;
   const canReach=reachable.has(key);
   const canHit=Boolean(occupant&&targets.has(occupant.id));
   return <button key={i} type="button" data-terrain={kind}
    data-reach={canReach?'true':undefined} data-hit={canHit?'true':undefined}
    style={{backgroundColor:terrainColors[kind]}}
    className={'got-cell'+(occupant?' occupied '+occupant.side:'')+
     (isDestination?' destination':'')+(routeKeys.has(key)?' got-route':'')+
     (kind!=='plain'?' got-terrain':'')+(canReach?' got-reach':'')+(canHit?' got-hit':'')}
    aria-label={'Quadrado '+x+','+y+' · '+kind+(occupant?' · '+occupant.name+' · '+
     conditionNames[occupant.condition]+(battle.advancedFormations?' · Frente '+
      (occupant.facing??'não definida'):''):'')+
     (canReach?' · movimento permitido':'')+(canHit?' · alvo permitido':'')}
    title={occupant?occupant.name+' · Saúde '+occupant.health+'/'+occupant.maxHealth:
     kind+' · '+x+','+y}
    onClick={()=>onCell(x,y)}>
    {!occupant&&<span className="got-cell-dot" aria-hidden="true">{kind==='plain'?'·':'▥'}</span>}
   </button>;
  })}
  <div className="got-board-layer" aria-hidden="true">
   {units.map(u=>renderToken(u))}
   {ghosts.map(g=>renderToken(g.unit,true))}
   {arrow&&<svg key={arrow.key} className="got-board-shot" viewBox={'0 0 '+battle.width+' '+battle.height}
    preserveAspectRatio="none">
    <line x1={arrow.from.x+.5} y1={arrow.from.y+.5} x2={arrow.to.x+.5} y2={arrow.to.y+.5}
     pathLength={1}/>
   </svg>}
   {floaters.map(n=><span key={n.key} className={'got-floater is-'+n.tone}
    style={{left:leftOf(n.x,battle.width),top:topOf(n.y,battle.height),
     width:sizeOf(battle.width)}}>{n.text}</span>)}
  </div>
 </div>;
}
