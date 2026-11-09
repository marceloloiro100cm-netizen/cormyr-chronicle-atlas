import {useEffect,useMemo,useState,type ChangeEvent,type KeyboardEvent} from 'react';
import {Button} from '@/components/ui/button';
import {militaryUnitSymbolSrc} from '@/components/house/military-unit-symbol';
import {SQUARE_TERRAIN_PRESENTATION,SQUARE_SIDE_PRESENTATION} from '@/lib/battle/geometry/square-presentation';
import {BattleSquareLegend} from './BattleSquareLegend';
import {parseSharedSquareMap,sharedFromCrzMap,sharedToCrzMap,serializeSharedSquareMap} from '@/lib/battle/geometry/shared-square-map';
import {BattleExpandedView} from './BattleExpandedView';
import {BattleTurnCue} from './BattleTurnCue';
import {BattleCommanderPortrait} from './BattleCommanderPortrait';
import {crzHexKey,crzGridToOffset,crzScenario,crzFootprintCells,
 type CrzHex,type CrzSide,type CrzMap}
 from '@/lib/crusade/geometry';
import {crzLegalCommands,type CrzCommand} from '@/lib/crusade/turns';
import {crzCapable,crzOrder,type CrzBattleStack,type CrzBattleState,
 type CrzEvent} from '@/lib/crusade/battle-state';
import {CRZ_ADVANCED_SPELLS,crzShieldWallTargets} from '@/lib/crusade/leader';
import {crzReplayBegin,crzReplayParse,crzReplayRecord,
 crzReplaySerialize,CRZ_REPLAY_MAX_BYTES,
 type CrzReplaySession} from '@/lib/crusade/replay';
import {crzTrainingAdvanceAi,crzTrainingReplayAt}
 from '@/lib/crusade/training-flow';
import {CRZ_TRAINING_DEFAULTS,CRZ_TRAINING_SCENARIOS,
 crzTrainingReady,type CrzTrainingOptions}
 from '@/lib/crusade/training-demo';
import type {CrzSpellId} from '@/lib/crusade/setup';
import {DndCormyr300Library} from './DndCormyr300Library';
import {dndCormyrCreature,type DndCormyrCatalog} from '@/lib/crusade/dnd-cormyr-300';
import {DND_MILITARY_MAPPING,dndMilitaryTemplateId,dndMilitaryType}
 from '@/lib/crusade/dnd-military';
import {DND_DEFAULT_STACKS,dndBattleReady,type DndStackDraft}
 from '@/lib/crusade/dnd-battle';
import {DND_MILITARY_CREATURES} from '@/lib/crusade/dnd-military';
import {PLAYER_DND_MODELS} from '@/lib/crusade/dnd-player-models';
import {saveDndBattle,listDndBattles,loadDndBattle,
 type DndSavedBattle} from '@/lib/crusade/dnd-private-sessions';
import {isDndReplay,isDndBattle,isDndV3} from '@/lib/crusade/dnd-mode';
import {initialGeneralProfile,awardGeneralTraining,
 type TrainingGeneralProfile} from '@/lib/crusade/general-progression';
import {readGeneralTrainingProfile,saveGeneralTrainingProfile}
 from '@/lib/crusade/training-profile-store';
import {crzObservedObjectives,crzAfterActionReport,crzAfterActionSerialize,
 type CrzObservedObjective} from '@/lib/crusade/insights';
import './crz-lab.css';
import './battle-legibility.css';
import './battle-ui-v4.css';
import './battle-arena-unified.css';
import './dnd-lab.css';

type SidePanel='actions'|'objectives'|'report'|'replay';
const SPELL_LABELS:Readonly<Record<string,string>>={
 bless:'Bênção',bane:'Maldição',shield_of_faith:'Escudo da fé',
 heroism:'Heroísmo',cause_fear:'Amedrontar',cure_wounds:'Curar ferimentos',
 firebolt:'Raio de fogo',fireball:'Bola de fogo (área)',shield_wall_formation:'Formação de escudos',
};
/** Tokens fictícios CRZ adotam o mesmo catálogo heráldico das tropas
 * de Cormyr. Criaturas importadas sem correspondência mostram iniciais.
 */
export const CRZ_MODEL_MILITARY_TYPE:Readonly<Record<string,string>>={
 'guard-cca|original':'garrison',
 'archer-cca|original':'archers',
 'raider-cca|original':'raiders',
 'scout-cca|original':'scouts',
};
export const crzUnitMilitarySymbol=(templateId:string):string|undefined=>
 militaryUnitSymbolSrc(templateId)||
 militaryUnitSymbolSrc(CRZ_MODEL_MILITARY_TYPE[templateId]??dndMilitaryType(templateId));

const TERRAIN:Readonly<Record<string,{name:string;fill:string}>>={
 plain:{name:SQUARE_TERRAIN_PRESENTATION.plain.name,fill:SQUARE_TERRAIN_PRESENTATION.plain.color},
 forest:{name:SQUARE_TERRAIN_PRESENTATION.forest.name,fill:SQUARE_TERRAIN_PRESENTATION.forest.color},
 hill:{name:SQUARE_TERRAIN_PRESENTATION.hill.name,fill:SQUARE_TERRAIN_PRESENTATION.hill.color},
 rock:{name:SQUARE_TERRAIN_PRESENTATION.rock.name,fill:SQUARE_TERRAIN_PRESENTATION.rock.color},
};
const SIDE:Readonly<Record<CrzSide,{name:string;fill:string}>>={
 attacker:{name:'Coroa',fill:SQUARE_SIDE_PRESENTATION.attacker.color},
 defender:{name:'Ashkar',fill:SQUARE_SIDE_PRESENTATION.defender.color},
};
const SIZE=25;
const XSTEP=Math.sqrt(3)*SIZE;
const SQUARE_STEP=SIZE*2.15;
const HEX_POINTS=Array.from({length:6},(_,i)=>{
 const angle=(-90+60*i)*Math.PI/180;
 return (SIZE*Math.cos(angle)).toFixed(2)+','+
  (SIZE*Math.sin(angle)).toFixed(2);
}).join(' ');
const pixel=(map:CrzMap,h:CrzHex)=>{
 const {column,row}=crzGridToOffset(map,h);
 return map.grid==='square'?{x:SQUARE_STEP*(column+0.75),y:SQUARE_STEP*(row+0.75)}:
  {x:42+XSTEP*(column+(row&1)/2),y:40+SIZE*1.5*row};
};
const count=(s:CrzBattleStack)=>s.alive+'/'+s.initialCount;
function eventLabel(event:CrzEvent):string{
 const names:Record<string,string>={
  BATTLE_STARTED:'Batalha iniciada',ROUND_STARTED:'Início da rodada',
  ROUND_ENDED:'Rodada encerrada',ACTIVATION_STARTED:'Unidade ativada',
  ACTIVATION_ENDED:'Ativação encerrada',MOVED:'Movimento',
  ATTACK_RESOLVED:'Ataque',RETALIATION_RESOLVED:'Retaliação',
  WAITED:'Aguardou',DEFENDED:'Defendeu',
  ABILITY_USED:'Habilidade',SPELL_CAST:'Magia do General',
  SPELL_DAMAGE:'Dano mágico',SPELL_HEALED:'Cura',
  EFFECT_APPLIED:'Efeito aplicado',EFFECT_EXPIRED:'Efeito expirado',
  MORALE_CHANGED:'Moral alterada',STACK_ROUTED:'Debandada',
  DND_COUNT_CHANGED:'Efetivo ajustado',DND_STACK_WITHDRAWN:'Pilha retirada',
  DND_STACK_ADDED:'Reforço adicionado',
  STACK_DESTROYED:'Pilha destruída',BATTLE_ENDED:'Batalha encerrada',
  EXTRA_TURN_GRANTED:'Ativação extra',TURN_SKIPPED:'Turno perdido',
 };
 const extra='unitId' in event?event.unitId:
  'leaderId' in event?event.leaderId:'';
 const damage='appliedDamage' in event?' · '+event.appliedDamage+' PV':'';
 const result=event.type==='ATTACK_RESOLVED'||event.type==='RETALIATION_RESOLVED'?
  ' · '+event.hits+'/'+event.attacks+' acertos'+
  (event.crits?' · '+event.crits+' críticos':''):''; 
 return '#'+event.seq+' '+(names[event.type]??event.type)+
  (extra?' · '+extra:'')+result+damage;
}

export function CrzBoard({state,selectedId,hoveredId,moves,attacks,objectives,onTile}:{
 state:CrzBattleState;selectedId:string|null;hoveredId:string|null;
 moves:readonly CrzHex[];attacks:readonly string[];
 objectives:readonly CrzObservedObjective[];
 onTile:(hex:CrzHex)=>void;
}){
 const [zoom,setZoom]=useState<100|150|200>(100);
 const [focusedKey,setFocusedKey]=useState<string|null>(null);
 const defaultFocus=crzHexKey(state.stacks.find(s=>s.id===state.activeStackId)?.position??state.map.tiles[0]!);
 const objectivesByHex=new Map(objectives.map(o=>[crzHexKey(o.position),o]));
 const movable=new Set(moves.map(crzHexKey));
 const targets=new Set(attacks);
 const occupied=new Map(state.stacks.filter(crzCapable)
  .map(s=>[crzHexKey(s.position),s]));
 const footprints=new Map<string,CrzBattleStack>(isDndV3(state)?
  state.stacks.filter(crzCapable).flatMap(stack=>
   crzFootprintCells(state.map,stack.position,stack.size).map(h=>
    [crzHexKey(h),stack] as const)):[...occupied]);
 const square=state.map.grid==='square';
 const width=square?SQUARE_STEP*(state.map.width+1.5):XSTEP*(state.map.width+1)+58;
 const height=square?SQUARE_STEP*(state.map.height+1.5):SIZE*(1.5*(state.map.height-1)+3.4);
 return <div className="crz-board-shell">
  <div className="crz-map-tools" role="group" aria-label="Ferramentas do mapa CRZ">
   <Button type="button" variant="outline" size="sm" aria-label="Reduzir zoom CRZ"
    disabled={zoom===100} onClick={()=>setZoom(v=>v===200?150:100)}>−</Button>
   <output aria-label="Zoom do mapa CRZ">{zoom}%</output>
   <Button type="button" variant="outline" size="sm" aria-label="Ampliar zoom CRZ"
    disabled={zoom===200} onClick={()=>setZoom(v=>v===100?150:200)}>+</Button>
   <Button type="button" variant="outline" size="sm" onClick={()=>setZoom(100)}
    disabled={zoom===100}>Ajustar mapa CRZ</Button>
  </div>
  <p className="crz-map-help" id="crz-keyboard-help">Teclado: Tab entra no mapa;
   setas navegam pelas células; Enter ou Espaço executam a ação. Use o zoom
   para ampliar sem alterar o tamanho das tropas.</p>
  <div className="crz-map-scroll" role="region" tabIndex={0}
  aria-label="Área navegável do mapa CRZ">
  <svg className="crz-map" viewBox={`0 0 ${width} ${height}`}
   style={{width:zoom+'%'}} role="group" aria-label={`Mapa CRZ ${state.map.width} por ${state.map.height}`}>
   {state.map.tiles.map(tile=>{
    const key=crzHexKey(tile),{x,y}=pixel(state.map,tile),
     unit=occupied.get(key),covered=footprints.get(key),objective=objectivesByHex.get(key);
    const isMove=movable.has(key);
    const isAttack=Boolean(covered&&targets.has(covered.id));
    const active=covered?.id===state.activeStackId,selected=covered?.id===selectedId;
    const hovered=covered?.id===hoveredId;
    const label=(isMove?'Mover para ':isAttack?'Atacar ':'Inspecionar ')+
     (covered?covered.name+' · ':'')+TERRAIN[tile.terrain]!.name+
     ' ('+crzGridToOffset(state.map,tile).column+','+
       crzGridToOffset(state.map,tile).row+')'+
       (objective?' · Marco: '+objective.title:'');
    const press=()=>onTile(covered?.position??{q:tile.q,r:tile.r});
    const keyPress=(event:KeyboardEvent<SVGGElement>)=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();press();return;}
     const direction:Record<string,CrzHex>={
      ArrowRight:{q:1,r:0},ArrowLeft:{q:-1,r:0},
      ArrowUp:{q:0,r:-1},ArrowDown:{q:0,r:1},
     };
     const delta=direction[event.key];if(!delta)return;
     const nextKey=crzHexKey({q:tile.q+delta.q,r:tile.r+delta.r});
     const siblings=event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>('[data-crz-hex]');
     const next=siblings&&Array.from(siblings).find(node=>node.getAttribute('data-crz-hex')===nextKey);
     if(next){event.preventDefault();setFocusedKey(nextKey);next.focus();}
    };
    return <g key={key} role="button"
     data-crz-hex={key} tabIndex={key===(focusedKey??defaultFocus)?0:-1}
     aria-label={label} aria-describedby="crz-keyboard-help"
     onFocus={()=>setFocusedKey(key)}
     onClick={press} onKeyDown={keyPress}
     className={'crz-map-tile'+(isMove?' crz-map-move':'')+
       (isAttack?' crz-map-attack':'')+(active?' crz-map-active':'')+
       (selected?' crz-map-selected':'')+(hovered?' crz-map-hovered':'')}>
      {square?<rect data-crz-cell-shape="square" x={x-SQUARE_STEP/2} y={y-SQUARE_STEP/2} width={SQUARE_STEP}
       height={SQUARE_STEP} fill={TERRAIN[tile.terrain]!.fill}/>:
      <polygon data-crz-cell-shape="hex" points={HEX_POINTS} transform={`translate(${x} ${y})`}
       fill={TERRAIN[tile.terrain]!.fill}/>}
      {square&&covered&&!unit&&<rect data-dnd-footprint={covered.id}
       x={x-SQUARE_STEP/2} y={y-SQUARE_STEP/2}
       width={SQUARE_STEP} height={SQUARE_STEP}
       fill={active?'rgba(255,224,153,.25)':'rgba(255,224,153,.15)'}
       stroke={isAttack?'#ff6d54':'#c6aa70'} strokeWidth={isAttack?3:1.5}
       pointerEvents="none"/>}
      {isMove&&(square?<rect className="crz-valid-overlay"
       x={x-SQUARE_STEP/2} y={y-SQUARE_STEP/2} width={SQUARE_STEP} height={SQUARE_STEP}
       fill="rgba(99,255,116,.24)" pointerEvents="none"/>:
      <polygon className="crz-valid-overlay" points={HEX_POINTS}
       transform={`translate(${x} ${y})`} fill="rgba(99,255,116,.24)"
       pointerEvents="none"/> )}
      {unit&&<>
       {isAttack&&<circle data-crz-attack-ring={unit.id} cx={x} cy={y} r={22}
        fill="none" stroke="#ff6d54" strokeWidth={4} pointerEvents="none"/>}
       {hovered&&<circle data-crz-hover-ring={unit.id} cx={x} cy={y} r={23}
        fill="none" stroke="#ffe3a1" strokeWidth={4} pointerEvents="none"/>}
       {selected&&<circle data-crz-selected-ring={unit.id} cx={x} cy={y} r={21}
        fill="none" stroke="#79ff86" strokeWidth={4} pointerEvents="none"/>}
       <circle cx={x} cy={y} r={21}
        fill={SIDE[unit.side].fill} stroke={active?'#f9df9c':'#e4d8c2'}
        strokeWidth={active?3:1.8} pointerEvents="none"/>
       <rect x={x-17} y={y-21} width={34} height={34} rx={7}
        fill="#162629" stroke="#dbc58d" strokeWidth="1.2" pointerEvents="none"/>
       {crzUnitMilitarySymbol(unit.templateId)?
        <image href={crzUnitMilitarySymbol(unit.templateId)} x={x-16} y={y-20}
         width={32} height={32} preserveAspectRatio="xMidYMid meet" pointerEvents="none"/>:
        <text x={x} y={y-1} textAnchor="middle" fill="#fff" fontSize={13}
         fontWeight={700} pointerEvents="none">{unit.name.slice(0,2).toUpperCase()}</text>}
       <rect x={x-18} y={y+10} width={36} height={14} rx={6}
        fill="#1c2525" stroke="#dfc79a" strokeWidth=".6" pointerEvents="none"/>
       <text x={x} y={y+21} textAnchor="middle" fill="#fff" fontSize={11}
        fontWeight={700} pointerEvents="none">{unit.alive}</text>
      </>}
      {isMove&&!unit&&<circle cx={x} cy={y} r={5}
       fill="#b7fa8c" pointerEvents="none"/>}
      {objective&&<g pointerEvents="none" aria-hidden="true">
       <circle data-crz-objective={objective.id} cx={x+17} cy={y-17} r={8}
        fill={objective.holder?SIDE[objective.holder].fill:'#332e24'}
        stroke="#ffe1a2" strokeWidth={1.5}/>
       <text x={x+17} y={y-14.5} textAnchor="middle" fontSize={8}
        fontWeight={700} fill="#fff">{objective.id==='crossroads'?'1':
          objective.id==='watchpoint'?'2':'3'}</text>
      </g>}
     </g>;
   })}
  </svg>
 </div>
 <BattleSquareLegend/>
 </div>;
}

const globalSpell=(spell:CrzSpellId)=>spell==='bless'||spell==='bane'||
 spell==='shield_wall_formation';
const enemySpell=(spell:CrzSpellId)=>spell==='cause_fear'||spell==='firebolt'||spell==='fireball';
const spellCost:Partial<Record<CrzSpellId,number>>={
 bless:3,bane:3,shield_of_faith:2,heroism:4,cause_fear:3,
 cure_wounds:2,firebolt:2,fireball:6,shield_wall_formation:2,
};

export function BattleCrzLab({onBack,mode='crz',showSavedOnOpen=false,playerSandbox=false}:{
 onBack?:()=>void;mode?:'crz'|'dnd';showSavedOnOpen?:boolean;playerSandbox?:boolean;
}){
 const dndMode=mode==='dnd';
 const sandbox=dndMode&&playerSandbox;
 const [options,setOptions]=useState<CrzTrainingOptions>({...CRZ_TRAINING_DEFAULTS,
  grid:'square',preset:'CRZ-5E',resolution:dndMode?'rolled':'expected'});
 const [session,setSession]=useState<CrzReplaySession|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [replayStep,setReplayStep]=useState<number|null>(null);
 const [panel,setPanel]=useState<SidePanel>('actions');
 const [hoveredId,setHoveredId]=useState<string|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [spell,setSpell]=useState<CrzSpellId>('bless');
 const [spellTarget,setSpellTarget]=useState('');
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [showImport,setShowImport]=useState(false);
 const [dndRoster,setDndRoster]=useState<DndStackDraft[]>([...DND_DEFAULT_STACKS]);
 const [dndCormyr300,setDndCormyr300]=useState<DndCormyrCatalog|null>(null);
 const dndAllMonsters=useMemo(()=>sandbox?PLAYER_DND_MODELS.map(m=>m.creature):
  dndCormyr300?.monsters.map(dndCormyrCreature)??[],
  [dndCormyr300,sandbox]);
 const [dndSide,setDndSide]=useState<DndStackDraft['side']>('attacker');
 const [dndSearch,setDndSearch]=useState('');
 const [dndGroup,setDndGroup]=useState('all');
 const [dndSize,setDndSize]=useState('all');
 const [dndSource,setDndSource]=useState('all');
 const [dndCrMin,setDndCrMin]=useState('');
 const [dndCrMax,setDndCrMax]=useState('');
 const [dndChoiceId,setDndChoiceId]=useState('');
 const [dndCount,setDndCount]=useState(10);
 const dndChoices=useMemo(()=>[
  ...DND_MILITARY_MAPPING.filter(x=>!x.unavailableReason).map(x=>({
   id:dndMilitaryTemplateId(x.typeId),name:x.name,group:'Unidades militares',
   size:'M' as const,cr:undefined as number|undefined,
   source:'Modelo militar',hp:x.hp,ac:x.ac,
  })),
  ...(sandbox?PLAYER_DND_MODELS.map(m=>({
   id:m.creature.id,name:m.creature.name,group:m.group,
   size:m.creature.size,cr:m.creature.cr as number|undefined,
   source:m.creature.source,hp:m.creature.hp.average,ac:m.creature.ac,
  })):dndCormyr300?.monsters.map(m=>({
   id:'cy-'+m.id+'|local',name:m.name,group:m.group,
   size:m.size,cr:m.challenge_rating as number|undefined,
   source:m.source,hp:m.hp,ac:m.ac,
  }))??[]),
 ],[dndCormyr300,sandbox]);
 const dndGroups=useMemo(()=>[...new Set(dndChoices.map(x=>x.group))],
  [dndChoices]);
 const dndSources=useMemo(()=>[...new Set(dndChoices.map(x=>x.source))].sort(),
  [dndChoices]);
 const dndSizes=useMemo(()=>[...new Set(dndChoices.map(x=>x.size))].sort(),
  [dndChoices]);
 const filteredDndChoices=useMemo(()=>dndChoices.filter(x=>
  (dndGroup==='all'||x.group===dndGroup)&&
  (dndSize==='all'||x.size===dndSize)&&
  (dndSource==='all'||x.source===dndSource)&&
  (!dndCrMin||(x.cr!==undefined&&x.cr>=Number(dndCrMin)))&&
  (!dndCrMax||(x.cr!==undefined&&x.cr<=Number(dndCrMax)))&&
  (!dndSearch.trim()||[x.name,x.source].some(s=>
   s.toLocaleLowerCase('pt-BR').includes(dndSearch.trim().toLocaleLowerCase('pt-BR'))))),
  [dndChoices,dndGroup,dndSize,dndSource,dndCrMin,dndCrMax,dndSearch]);
 const chosenDnd=filteredDndChoices.find(x=>x.id===dndChoiceId)??
  filteredDndChoices[0];
 const [adminCount,setAdminCount]=useState(1);
 const [reinforceTemplate,setReinforceTemplate]=useState(dndMilitaryTemplateId('infantry'));
 const [reinforceSide,setReinforceSide]=useState<'attacker'|'defender'>('attacker');
 const [reinforceCount,setReinforceCount]=useState(1);
 const [dndWinner,setDndWinner]=useState<'attacker'|'defender'|'draw'>('draw');
 const [storedBattles,setStoredBattles]=useState<readonly DndSavedBattle[]>([]);
 const [savedPanelOpen,setSavedPanelOpen]=useState(showSavedOnOpen);
 const [lastSavedReplayStep,setLastSavedReplayStep]=useState<number|null>(null);
 const [restoreBattleId,setRestoreBattleId]=useState('');
 const [dndBusy,setDndBusy]=useState(false);
 const [highContrast,setHighContrast]=useState(false);
 const [generalProfile,setGeneralProfile]=useState<TrainingGeneralProfile>(initialGeneralProfile);
 const addDndCatalogStack=(templateId:string,_name:string,
  side:DndStackDraft['side'],count:number)=>{
  const template=[...DND_MILITARY_CREATURES,...dndAllMonsters].find(m=>m.id===templateId);
  if(!template){setError('Criatura importada não encontrada no catálogo.');return;}
  const limit=({T:1000,S:1000,M:1000,L:400,H:100,G:25} as const)[template.size];
  if(dndRoster.filter(d=>d.side===side).length>=7){
   setError('D&D: limite de sete pilhas para este lado.');return;
  }
  let n=1;while(dndRoster.some(d=>d.id===side+'-catalog-'+n))n++;
  const amount=Math.max(1,Math.min(limit,count));
  setDndRoster(current=>[...current,{
   id:side+'-catalog-'+n,side,templateId,count:amount,training:'trained'}]);
  setError('');
  setMessage(template.name+': '+amount+' criatura(s) adicionada(s) ao lado '+
   (side==='attacker'?'atacante.':'defensor.'));
 };
 const stackMaxCount=(templateId:string)=>{
  const template=[...DND_MILITARY_CREATURES,...dndAllMonsters].find(x=>x.id===templateId);
  const limits={T:1000,S:1000,M:1000,L:400,H:100,G:25};
  return template?limits[template.size]:1000;
 };
 const changeDndStack=(id:string,part:Partial<DndStackDraft>)=>{
  setDndRoster(current=>current.map(x=>x.id===id?{...x,...part,
   ...(part.templateId?{position:undefined}:{})}:x));
 };
 useEffect(()=>{if(!sandbox)setGeneralProfile(readGeneralTrainingProfile());},[sandbox]);
 const awardProgress=()=>{
  if(sandbox||!session)return;
  try{
   const result=awardGeneralTraining(generalProfile,session.replay);
   setGeneralProfile(result.profile);
   saveGeneralTrainingProfile(result.profile);
   setMessage(result.awarded>0?
    'General Tillet recebeu '+result.awarded+' XP de treinamento.':'Esta batalha já concedeu XP.');
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível validar a progressão.');}
 };
 const frame=useMemo(()=>!session?null:replayStep===null?session.state:
  crzTrainingReplayAt(session.replay,replayStep),
 [session,replayStep]);
 const report=useMemo(()=>session?crzAfterActionReport(session.replay):null,[session]);
 const objectives=useMemo(()=>frame?crzObservedObjectives(frame):[],[frame]);
 const active=frame?.stacks.find(s=>s.id===frame.activeStackId);
 const inspected=frame?.stacks.find(s=>s.id===selectedId&&crzCapable(s))??
  (active&&crzCapable(active)?active:undefined);
 useEffect(()=>{if(dndMode&&inspected)setAdminCount(inspected.alive);},
  [dndMode,inspected?.id,inspected?.alive]);
 const canAct=Boolean(session&&replayStep===null&&
  frame?.phase==='active'&&active&&frame.controls[active.side]==='human');
 const aiTurn=Boolean(session&&replayStep===null&&
  frame?.phase==='active'&&active&&frame.controls[active.side]==='ai');
 const legal=canAct&&frame?crzLegalCommands(frame):[];
 const moves=legal.filter((c):c is Extract<CrzCommand,{type:'MOVE'}>=>
  c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<CrzCommand,{type:'ATTACK'}>=>
  c.type==='ATTACK');
 const abilities=legal.filter((c):c is Extract<CrzCommand,{type:'ABILITY'}>=>
  c.type==='ABILITY');
 const spells=legal.filter((c):c is Extract<CrzCommand,{type:'CAST'}>=>
  c.type==='CAST').filter(c=>CRZ_ADVANCED_SPELLS.includes(c.spellId));
 const caster=active?frame?.leaders[active.side]:null;
 const selectedSpell:CrzSpellId=caster?.spells.includes(spell)?
  spell:caster?.spells[0]??spell;
 const canCast=canAct&&spells.some(c=>c.spellId===selectedSpell)&&
  Boolean(caster&&caster.energy>=(spellCost[selectedSpell]??Infinity))&&
  (selectedSpell!=='shield_wall_formation'||Boolean(frame&&active&&
   crzShieldWallTargets(frame,active.side).length>0));
 const targets=active?frame?.stacks.filter(s=>crzCapable(s)&&
  s.side===(enemySpell(selectedSpell)?
   active.side==='attacker'?'defender':'attacker':active.side))??[]:[];
 const apply=(command:CrzCommand)=>{
  if(!session||!canAct)return;
  try{
   const next=crzTrainingAdvanceAi(crzReplayRecord(session,command,'human'));
   setSession(next);setReplayStep(null);setSelectedId(next.state.activeStackId);
   setSpellTarget('');setError('');
   setMessage('Comando registrado no replay verificável.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Comando recusado.');
  }
 };
 const adminCommand=(command:CrzCommand)=>{
  if(sandbox||!dndMode||!session||replayStep!==null||session.state.phase!=='active')return;
  try{
   const updated=crzReplayRecord(session,command,'human');
   setSession(updated);setError('');setReplayStep(null);
   setSelectedId(updated.state.stacks.some(x=>x.id===selectedId&&crzCapable(x))?
    selectedId:updated.state.activeStackId);
   setMessage('Ajuste do Narrador registrado no replay da batalha.');
  }catch(e){setError(e instanceof Error?e.message:'Ajuste da batalha recusado.');}
 };
 const addReinforcement=()=>{
  if(sandbox||!session?.state.activeStackId)return;
  const list=[...DND_MILITARY_CREATURES,...dndAllMonsters,
   ...session.state.stacks.map(x=>x.template)];
  const template=list.find(x=>x.id===reinforceTemplate);
  if(!template){setError('Selecione um modelo de reforço válido.');return;}
  const id=reinforceSide+'-reinforce-'+Date.now().toString(36);
  adminCommand({type:'DND_ADD_STACK',unitId:session.state.activeStackId,
   stackId:id,side:reinforceSide,count:reinforceCount,template});
 };
 const saveSession=async()=>{
  if(sandbox||!dndMode||!session)return;
  setDndBusy(true);
  try{
   await saveDndBattle(session);
   setLastSavedReplayStep(session.replay.steps.length);
   setMessage('Batalha salva no banco privado do Narrador.');
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar batalha.');}
  finally{setDndBusy(false);}
 };
 const fetchSaves=async()=>{
  if(sandbox)return;
  setDndBusy(true);
  try{
   const records=await listDndBattles();
   setStoredBattles(records);setRestoreBattleId(records[0]?.battleId??'');
   setError('');
   setMessage(records.length+' batalha(s) privada(s) encontrada(s).');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao consultar batalhas.');}
  finally{setDndBusy(false);}
 };
 const restoreSession=async()=>{
  if(sandbox||!restoreBattleId)return;
  setDndBusy(true);
  try{
   const loaded=await loadDndBattle(restoreBattleId);
   setSession(loaded);setLastSavedReplayStep(loaded.replay.steps.length);
   setSelectedId(loaded.state.activeStackId);
   setExpanded(true);setReplayStep(null);setError('');setPanel('actions');
   setMessage('Batalha privada restaurada com replay validado.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao recuperar batalha.');}
  finally{setDndBusy(false);}
 };
 const begin=()=>{
  try{
   const ready=dndMode?dndBattleReady({...options,grid:'square',
    preset:'CRZ-5E'},dndRoster.map(stack=>({...stack,position:undefined})),
    dndAllMonsters,Date.now().toString(36)):
    crzTrainingReady({...options,grid:'square',
     ...(options.preset?{preset:options.preset}:{}),
     generalLevel:generalProfile.level});
   const initial=crzReplayBegin(ready);
   const next=crzTrainingAdvanceAi(initial);
   setSession(next);setLastSavedReplayStep(null);setSelectedId(next.state.activeStackId);
   setPanel('actions');setReplayStep(null);setError('');setExpanded(true);
   setMessage(dndMode?'Batalha D&D iniciada com d20 e pilhas locais. Nenhuma ficha oficial será alterada.':
    'Treino fictício iniciado. Nenhuma ficha oficial será alterada.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Não foi possível iniciar o treino.');
  }
 };
 /** Clique contextual: somente a pilha do turno pode mover/atacar.
  * Toda jogada continua validada por crzLegalCommands e crzReplayRecord.
  */
 const clickHex=(hex:CrzHex)=>{
  if(!frame)return;
  const key=crzHexKey(hex);
  const unit=frame.stacks.find(s=>crzCapable(s)&&crzHexKey(s.position)===key);
  if(canAct&&active&&selectedId===active.id){
   const attack=unit&&attacks.find(c=>c.targetId===unit.id);
   if(attack){apply(attack);return;}
   if(!unit){
    const move=moves.find(c=>crzHexKey(c.to)===key);
    if(move){apply(move);return;}
   }
  }
  if(unit){
   setSelectedId(unit.id);
   setError('');
  }else if(canAct&&active&&selectedId===active.id){
   setError('Quadrado fora do movimento permitido. Selecione um quadrado verde.');
  }
 };
 const orderIds=frame?[
  ...(frame.activeStackId?[frame.activeStackId]:[]),
  ...frame.activationQueue,...frame.waitingQueue,
  ...crzOrder(frame.stacks),
 ]:[];
 const turnOrder=frame?[...new Set(orderIds)].map(id=>
  frame.stacks.find(unit=>unit.id===id)).filter(
   (unit):unit is CrzBattleStack=>Boolean(unit&&crzCapable(unit))):[];
 const cast=()=>{
  if(!active||!canCast)return;
  if(!globalSpell(selectedSpell)&&!spellTarget){
   setError('Escolha uma pilha como alvo da magia.');return;
  }
  apply({type:'CAST',unitId:active.id,spellId:selectedSpell,
   targetId:globalSpell(selectedSpell)?null:spellTarget});
 };
 const exportReplay=()=>{
  if(!session)return;
  try{
   const contents=crzReplaySerialize(session.replay);
   const blob=new Blob([contents],{type:'application/json'});
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=session.state.id+'-crz-replay.json';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   URL.revokeObjectURL(url);
   setError('');setMessage('Replay JSON verificado e exportado localmente.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Falha na exportação.');}
 };
 const exportReport=()=>{
  if(!session)return;
  try{
   const contents=crzAfterActionSerialize(session.replay);
   const blob=new Blob([contents],{type:'application/json'});
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=session.state.id+'-crz-after-action.json';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   URL.revokeObjectURL(url);
   setError('');setMessage('Relatório derivado do replay validado e exportado.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Não foi possível exportar relatório.');
  }
 };
 const importReplay=async(event:ChangeEvent<HTMLInputElement>)=>{
  if(sandbox)return;
  const file=event.currentTarget.files?.[0];
  if(!file)return;
  try{
   if(file.size>CRZ_REPLAY_MAX_BYTES)throw new Error('Arquivo maior que o limite de 8 MB.');
   const next=crzReplayParse(await file.text());
   if(dndMode!==isDndReplay(next.state))
    throw Error('O replay pertence a outro modo de batalha.');
   setSession(next);setReplayStep(next.replay.steps.length);
   setSelectedId(next.state.activeStackId);setPanel('replay');setExpanded(true);
   setShowImport(false);setError('');
   setMessage('Replay validado. Use a linha do tempo ou retome o treino.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Replay não verificável.');
  }finally{event.currentTarget.value='';}
 };
 const confirmExit=()=>!session||session.replay.steps.length===lastSavedReplayStep||
  window.confirm('Esta batalha contém mudanças não salvas. Deseja sair?');
 const leave=()=>{if(confirmExit())onBack?.();};
 const reset=()=>{
  if(!confirmExit())return;
  setLastSavedReplayStep(null);
  setExpanded(false);setSession(null);setReplayStep(null);setSelectedId(null);
  setError('');setMessage('');setPanel('actions');setHoveredId(null);
 };
 const savedPanel=dndMode&&!sandbox?<details className="battle-surface"
  aria-label="Batalhas D&D salvas" open={savedPanelOpen}
  onToggle={event=>setSavedPanelOpen(event.currentTarget.open)}>
  <summary>Batalhas privadas do Narrador</summary>
  <Button variant="outline" disabled={dndBusy}
   onClick={()=>void fetchSaves()}>Consultar batalhas salvas</Button>
  {storedBattles.length>0&&<>
   <label>Escolher batalha para continuar
    <select value={restoreBattleId} aria-label="Batalha D&D para retomar"
     onChange={e=>setRestoreBattleId(e.target.value)}>
     {storedBattles.map(b=><option key={b.battleId} value={b.battleId}>
      {b.battleId} · {new Date(b.updatedAt).toLocaleString('pt-BR')}</option>)}
    </select>
   </label>
   <Button disabled={dndBusy||!restoreBattleId} onClick={()=>void restoreSession()}>
    Retomar batalha salva</Button>
  </>}
 </details>:null;
 const arena=<section className={'battle-module crusade-mode crz-lab'+
  (highContrast?' crz-high-contrast':'')}
  aria-label={sandbox?'D&D · simulador local do jogador':dndMode?'D&D simplificado · laboratório do Narrador':'Laboratório CRZ-1.0 do Narrador'}>
  {!session&&<>
   <header className="battle-header crz-intro">
    <p className="battle-eyebrow">{sandbox?'CORMYR · SIMULAÇÃO DO JOGADOR':'CORMYR · LABORATÓRIO DO NARRADOR'}</p>
    <h1>{dndMode?'D&D · Combate simplificado':'CRZ-1.0 · Cruzada Experimental'}</h1>
    <p>{dndMode?'Regras simplificadas de inspiração 5e: ataque, CA, PV, movimento e iniciativa em quadrados.':
     'Treinamento tático com exércitos-modelo.'}
     Nenhum efeito em casas, baixas oficiais, contas ou no calendário.</p>
    <div className="crz-toolbar">
     {onBack&&<Button variant="outline" onClick={leave}>Voltar ao módulo</Button>}
     {!sandbox&&<Button variant="outline" onClick={()=>setShowImport(v=>!v)}>
      Importar replay JSON
     </Button>}
     <Button variant="outline" aria-pressed={highContrast}
      onClick={()=>setHighContrast(v=>!v)}>Alto contraste CRZ</Button>
    </div>
    {!sandbox&&showImport&&<label className="crz-file">
     Arquivo de replay (máximo 8 MB)
     <input aria-label="Arquivo de replay CRZ" type="file"
      accept=".json,application/json" onChange={event=>{void importReplay(event);}}/>
    </label>}
   </header>
   {error&&<p className="crz-alert" role="alert">{error}</p>}
   {message&&<p className="crz-status" role="status">{message}</p>}
   {savedPanel}
   <section className="battle-surface" aria-label="Preparar treino CRZ">
    {dndMode&&<div className="battle-simple-launch" aria-label="Início rápido D&D">
     <h3>Batalha rápida</h3>
     <p>{dndRoster.filter(x=>x.side==='attacker').length} grupos atacantes ×
      {dndRoster.filter(x=>x.side==='defender').length} defensores · mapa quadrado</p>
     <Button onClick={begin}>Batalhar agora</Button>
    </div>}
    <details className="battle-advanced-config" open={!dndMode}>
     <summary>{dndMode?'Montar exércitos e ajustar cenário':'Configuração do laboratório'}</summary>
    <h2>{dndMode?'Preparar combate D&D':'Preparar batalha-modelo'}</h2>
    {!dndMode&&<p>Defensores da Coroa contra forças fictícias de Ashkar.</p>}
    {!dndMode&&<section className="battle-surface" aria-label="Mapas quadrados compartilhados">
     <h3>Mapa quadrado compartilhado</h3>
     <p>Importe um mapa quadrado de Adaptado ou Game of Thrones.
      Somente terrenos básicos são transferidos; regras de combate não são copiadas.</p>
     <label>Importar arquivo JSON do mapa
      <input type="file" accept=".json,application/json" aria-label="Importar mapa quadrado D&D"
       onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';
        if(!file)return;
        if(file.size>100000){setError('Arquivo de mapa excede 100 KB.');return;}
        void file.text().then(json=>{
         const common=parseSharedSquareMap(json);
         setOptions(o=>({...o,grid:'square',width:common.width,sharedMap:common}));
         setError('');setMessage('Mapa quadrado compartilhado importado: '+common.width+
          ' × '+common.height+'.');
        }).catch(err=>setError(err instanceof Error?err.message:'Mapa inválido.'));
       }}/>
     </label>
     <Button variant="outline" onClick={()=>{
      try{
       const map=frame?.map??(options.sharedMap?sharedToCrzMap(options.sharedMap):
        crzScenario(options.scenario,options.width,options.grid??'square'));
       const shared=sharedFromCrzMap(map);
       const blob=new Blob([serializeSharedSquareMap(shared)],{type:'application/json'});
       const url=URL.createObjectURL(blob),anchor=document.createElement('a');
       anchor.href=url;anchor.download='mapa-cormyr-quadrado.json';anchor.click();
       URL.revokeObjectURL(url);
       setMessage('Mapa compartilhado exportado.');setError('');
      }catch(err){setError(err instanceof Error?err.message:'Mapa não exportado.');}
     }}>Exportar mapa quadrado</Button>
     {options.sharedMap&&<p role="status">Mapa compartilhado em uso:
      {options.sharedMap.name} · {options.sharedMap.width} × {options.sharedMap.height}.</p>}
    </section>}
    {dndMode&&<section className="dnd-config" aria-label="Preparação de exércitos D&D">
     <h3>Montros</h3>
     <p>Escolha o lado, busque uma criatura e informe a quantidade. As pilhas são
      posicionadas automaticamente ao iniciar a batalha, sem afetar as Casas.</p>
     {sandbox?<p role="status" className="battle-note">
      Modelos fictícios disponíveis. O bestiário privado do Narrador não é consultado.
     </p>:<DndCormyr300Library compact onCatalog={setDndCormyr300}
      onAdd={addDndCatalogStack}
      sideCounts={{
       attacker:dndRoster.filter(x=>x.side==='attacker').length,
       defender:dndRoster.filter(x=>x.side==='defender').length,
      }}/>} 
     <div className="dnd-side-switch" role="group" aria-label="Selecionar exército D&D">
      {(['attacker','defender'] as const).map(side=><Button key={side}
       type="button" variant={dndSide===side?'default':'outline'}
       aria-pressed={dndSide===side} onClick={()=>setDndSide(side)}>
       {side==='attacker'?'Atacante':'Defensor'} ·
       {dndRoster.filter(x=>x.side===side).length}/7 pilhas
      </Button>)}
     </div>
     <details className="dnd-filter-details">
      <summary>Filtros avançados de monstros</summary>
      <div className="dnd-extra-filters">
       <label>Tamanho
        <select aria-label="Filtrar tamanho D&D" value={dndSize}
         onChange={e=>setDndSize(e.target.value)}>
         <option value="all">Todos os tamanhos</option>
         {dndSizes.map(size=><option key={size} value={size}>{size}</option>)}
        </select>
       </label>
       <label>Fonte
        <select aria-label="Filtrar fonte D&D" value={dndSource}
         onChange={e=>setDndSource(e.target.value)}>
         <option value="all">Todas as fontes</option>
         {dndSources.map(source=><option key={source} value={source}>{source}</option>)}
        </select>
       </label>
       <label>ND mínimo
        <input type="number" min={0} max={30} step={0.125}
         aria-label="ND mínimo D&D" value={dndCrMin}
         onChange={e=>setDndCrMin(e.target.value)}/>
       </label>
       <label>ND máximo
        <input type="number" min={0} max={30} step={0.125}
         aria-label="ND máximo D&D" value={dndCrMax}
         onChange={e=>setDndCrMax(e.target.value)}/>
       </label>
       <Button variant="outline" onClick={()=>{
        setDndSearch('');setDndGroup('all');setDndSize('all');
        setDndSource('all');setDndCrMin('');setDndCrMax('');setDndChoiceId('');
       }}>Limpar filtros</Button>
      </div>
     </details>
     <div className="dnd-picker" role="group" aria-label="Escolher monstro para o exército">
      <label>Buscar pelo nome
       <input type="search" aria-label="Buscar monstro D&D"
        placeholder="Nome do monstro ou unidade…" value={dndSearch}
        onChange={e=>setDndSearch(e.target.value)}/>
      </label>
      <label>Grupo
       <select aria-label="Grupo de monstros D&D" value={dndGroup}
        onChange={e=>setDndGroup(e.target.value)}>
        <option value="all">Todos os grupos</option>
        {dndGroups.map(group=><option key={group} value={group}>{group}</option>)}
       </select>
      </label>
      <label>Monstro ou unidade
       <select aria-label="Monstro D&D para adicionar"
        value={chosenDnd?.id??''} disabled={!chosenDnd}
        onChange={e=>setDndChoiceId(e.target.value)}>
        {!chosenDnd&&<option value="">Nenhum resultado</option>}
        {filteredDndChoices.map(item=><option key={item.id} value={item.id}>
         {item.name}{item.cr===undefined?'':' · ND '+item.cr}</option>)}
       </select>
      </label>
      <label>Quantidade
       <input aria-label="Quantidade de monstros D&D" type="number"
        min={1} max={1000} step={1} value={dndCount}
        onChange={e=>setDndCount(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/>
      </label>
      <Button type="button" disabled={!chosenDnd||
       dndRoster.filter(x=>x.side===dndSide).length>=7}
       onClick={()=>chosenDnd&&addDndCatalogStack(chosenDnd.id,chosenDnd.name,
        dndSide,dndCount)}>
       Adicionar ao {dndSide==='attacker'?'atacante':'defensor'}
      </Button>
     </div>
     <div className="dnd-choice-preview" role="status"
      aria-label="Prévia da criatura selecionada">
      {chosenDnd?<><strong>{chosenDnd.name}</strong>
       <span>Grupo: {chosenDnd.group} · Porte: {chosenDnd.size} ·
        {chosenDnd.cr===undefined?' Perfil militar':' ND '+chosenDnd.cr}</span>
       <span>PV {chosenDnd.hp??'—'} · CA {chosenDnd.ac??'—'} ·
        Fonte: {chosenDnd.source}</span></>:
       <span>Nenhum monstro corresponde aos filtros.</span>}
      <span>{filteredDndChoices.length} opção(ões) no filtro.</span>
     </div>
     <section className="dnd-encounter-summary" aria-label="Resumo do confronto D&D">
      <h4>Composição do encontro</h4>
      <div className="dnd-encounter-sides">
       {(['attacker','defender'] as const).map(side=>{
        const roster=dndRoster.filter(x=>x.side===side);
        return <div className="dnd-encounter-side" key={side}>
         <strong>{side==='attacker'?'Atacantes':'Defensores'}</strong>
         <span>{roster.length}/7 pilhas · {roster.reduce((sum,x)=>sum+x.count,0)}
          {' '}criaturas</span>
        </div>;
       })}
      </div>
      <p>As pilhas serão posicionadas automaticamente. As quantidades são independentes
       das unidades oficiais da campanha.</p>
      <Button variant="outline" size="sm" onClick={()=>{
       if(window.confirm('Restaurar os exércitos de exemplo e descartar esta composição?')){
        setDndRoster([...DND_DEFAULT_STACKS]);setError('');
       }
      }}>Restaurar exércitos de exemplo</Button>
     </section>
     <section className="dnd-roster-side"
      aria-label={'Pilha D&D '+(dndSide==='attacker'?'atacante':'defensora')}>
      <h4>{dndSide==='attacker'?'Exército atacante':'Exército defensor'}</h4>
      <p>{dndRoster.filter(x=>x.side===dndSide).length} pilhas configuradas.
       O posicionamento no mapa será automático.</p>
      {dndRoster.filter(x=>x.side===dndSide).map(stack=><div
       className="dnd-stack-row" key={stack.id}>
       <div className="dnd-stack-identity">
        <strong>{dndChoices.find(x=>x.id===stack.templateId)?.name??stack.templateId}</strong>
        <small>{dndChoices.find(x=>x.id===stack.templateId)?.group??'Unidade'}</small>
       </div>
       <label>Quantidade na pilha
        <input type="number" min={1} max={stackMaxCount(stack.templateId)}
         step={1} value={stack.count} aria-label={'Quantidade D&D '+stack.id}
         onChange={e=>changeDndStack(stack.id,{count:Math.min(
          stackMaxCount(stack.templateId),Math.max(1,Number(e.target.value)||1))})}/>
       </label>
       <label>Treinamento
        <select value={stack.training} aria-label={'Treinamento D&D '+stack.id}
         onChange={e=>changeDndStack(stack.id,{
          training:e.target.value as DndStackDraft['training']})}>
         <option value="green">Verde</option><option value="trained">Treinado</option>
         <option value="veteran">Veterano</option><option value="elite">Elite</option>
        </select>
       </label>
       <Button type="button" variant="outline" size="sm"
        disabled={dndRoster.filter(x=>x.side===dndSide).length>=7}
        onClick={()=>addDndCatalogStack(stack.templateId,
         dndChoices.find(x=>x.id===stack.templateId)?.name??stack.templateId,
         stack.side,stack.count)}>Duplicar pilha</Button>
       <Button type="button" variant="outline" size="sm"
        disabled={dndRoster.filter(x=>x.side===dndSide).length<2}
        onClick={()=>setDndRoster(current=>current.filter(x=>x.id!==stack.id))}>
        Retirar pilha</Button>
      </div>)}
     </section>
     <details className="dnd-conversion">
      <summary>Ver de/para das 17 unidades de Cormyr para D&D</summary>
      <p>PV e atributos são valores <strong>propostos para o simulador</strong>, não uma
       conversão oficial de Guerra dos Tronos nem estatísticas retiradas de D&D.</p>
      <div className="dnd-table-scroll"><table>
       <thead><tr><th>Unidade</th><th>PV</th><th>CA</th>
        <th>Ataque</th><th>Iniciativa</th><th>Deslocamento</th>
        <th>Distância</th><th>Empilhamento</th></tr></thead>
       <tbody>{DND_MILITARY_MAPPING.map(x=><tr key={x.typeId}>
        <th>{x.name}{x.requiresNarratorReview?' *':''}</th>
        <td>{x.unavailableReason?'—':x.hp}</td><td>{x.unavailableReason?'—':x.ac}</td>
        <td>{x.unavailableReason?'—':'+'+x.meleeToHit}</td>
        <td>{x.unavailableReason?'—':(x.initiativeModifier>=0?'+':'')+x.initiativeModifier}</td>
        <td>{x.unavailableReason?'—':x.speedFt+' pés'}</td>
        <td>{x.unavailableReason?'—':x.rangedToHit===undefined?'—':
         '+'+x.rangedToHit+' · à distância'}</td>
        <td>{x.unavailableReason??x.individualsPerOriginalUnit+' por unidade GOT'}</td>
       </tr>)}</tbody>
      </table></div>
     </details>
    </section>}
    <div className="crz-form">
     {!dndMode&&<label>Conjunto de regras
      <select aria-label="Preset CRZ" value={options.preset??'CRZ-5E'}
       onChange={e=>setOptions(o=>({...o,preset:e.target.value as NonNullable<CrzTrainingOptions['preset']>,
        resolution:e.target.value==='CRZ-5E'?o.resolution:'expected'}))}>
       <option value="CRZ-5E">CRZ-5E</option>
       <option value="CRZ-WOTR">CRZ-WOTR (esperado)</option>
       <option value="PTE-2.0-compat">PTE-2.0-compat (esperado)</option>
      </select>
     </label>}
     <label>Cenário
      <select value={options.scenario} aria-label="Cenário CRZ"
       onChange={e=>setOptions(o=>({...o,scenario:e.target.value as CrzTrainingOptions['scenario']}))}>
       {CRZ_TRAINING_SCENARIOS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
     </label>
     {!dndMode&&<label>Malha tática
      <select aria-label="Formato da malha CRZ" value={options.grid??'square'}
       disabled>
       <option value="square">Quadrados (novo padrão)</option>
       {/* Novas simulações usam apenas quadrados. */}
      </select>
     </label>}
     <label>Tamanho do mapa
      <select value={options.width} aria-label="Tamanho do mapa CRZ"
       onChange={e=>setOptions(o=>({...o,width:Number(e.target.value) as 11|15}))}>
       <option value={11}>11 × 9</option><option value={15}>15 × 11</option>
      </select>
     </label>
     <label>Resolução de dano
      <select value={options.resolution} aria-label="Resolução CRZ"
       onChange={e=>setOptions(o=>({...o,resolution:e.target.value as CrzTrainingOptions['resolution']}))}>
       {dndMode&&<option value="rolled">D20 rolado (cada criatura)</option>}
       <option value="expected">Esperada (probabilidade d20, sem rolagens)</option>
       <option value="hybrid" disabled={!dndMode&&(options.preset??'CRZ-5E')!=='CRZ-5E'}>
        Híbrida (d20 em pilhas pequenas; média nas grandes)</option>
      </select>
     </label>
     <label>Adversário
      <select value={options.opponent} aria-label="Oponente CRZ"
       onChange={e=>setOptions(o=>({...o,opponent:e.target.value as 'ai'|'human'}))}>
       <option value="ai">IA local</option>
       <option value="human">Segundo jogador local</option>
      </select>
     </label>
     <label>Seed hexadecimal
      <input value={options.seed} aria-label="Seed CRZ"
       maxLength={16} pattern="[a-fA-F0-9]{1,16}"
       onChange={e=>setOptions(o=>({...o,seed:e.target.value}))}/>
     </label>
    </div>
    {!dndMode&&<p className="battle-note">General Tillet · nível {generalProfile.level} · {generalProfile.xp} XP
     de treinamento local. O progresso não altera a Corte nem o exército.</p>}
    <Button onClick={begin}>{dndMode?'Iniciar batalha D&D · d20':'Iniciar treinamento CRZ'}</Button>
    <p className="battle-note">{dndMode?
     'D&D utiliza rolagens de d20, CA e PV por criatura, com pilhas que somam PV e baixas. Iniciativa é rolada uma vez por encontro. Não há compras ou baixas oficiais.':
     'CRZ-WOTR e PTE-compat são simulações experimentais determinísticas, sem paridade oficial ou aplicação de baixas. Os replays registram o preset e seu hash.'}</p>
    </details>
   </section>
  </>}
  {session&&frame&&<section className="crz-battle-stage"
   aria-label="Arena e comandos CRZ">
   <header className="crz-arena-head">
    <div className="crz-arena-heading">
     <span className="crz-eyebrow">CORMYR · ARENA DE TREINAMENTO</span>
     <h1>{dndMode?'Batalha D&D':'Cruzada'} <span>{dndMode?'d20 simplificado':'CRZ-1.0'}</span></h1>
     <p>Preset: {frame.rulesetId} · {dndMode?'V3 · quadrados de 10 pés · à distância sem teto · iniciativa d20':
     'General Tillet nível '+(frame.leaders.attacker?.level??'—')+' (treino)'}</p>
     <p>Rodada {frame.round} · {frame.phase==='completed'?
      'Batalha encerrada':active?'Turno de '+active.name:'Preparando turno'} ·
      {session.replay.steps.length} comandos registrados</p>
    </div>
    <div className="crz-arena-utilities">
      <Button variant="outline" className="battle-expand-toggle"
       aria-label={expanded?'Sair da tela ampliada':'Ampliar batalha'}
       onClick={()=>setExpanded(value=>!value)}>
       {expanded?'↙ Sair da tela ampliada':'⤢ Ampliar batalha'}
      </Button>
     {onBack&&<Button variant="outline" onClick={leave}>Voltar</Button>}
     <Button variant="outline" onClick={reset}>Novo treino</Button>
     <Button variant="outline" onClick={exportReplay}>Exportar replay</Button>
     {dndMode&&!sandbox&&<Button variant="outline" disabled={dndBusy}
      onClick={()=>void saveSession()}>Salvar batalha privada</Button>}
     {!dndMode&&session.state.phase==='completed'&&<Button variant="outline" onClick={awardProgress}>
      Registrar XP do General (treino)</Button>}
     <Button variant="outline" aria-pressed={highContrast}
      onClick={()=>setHighContrast(v=>!v)}>Alto contraste CRZ</Button>
     {!sandbox&&<Button variant="outline" onClick={()=>setShowImport(v=>!v)}>
      Importar replay
     </Button>}
    </div>
   </header>
   {!sandbox&&showImport&&<label className="crz-file">
    Importar replay CRZ (máximo 8 MB)
    <input type="file" accept=".json,application/json"
     aria-label="Arquivo de replay CRZ"
     onChange={event=>{void importReplay(event);}}/>
   </label>}
   {error&&<p className="crz-alert" role="alert">{error}</p>}
   {message&&<p className="crz-status" role="status">{message}</p>}
   <BattleTurnCue system={dndMode?'dnd':'adapted'} round={frame.round}
    phase={frame.phase} activeUnit={active?.name} canAct={canAct}
    moves={moves.length} attacks={attacks.length}
    needsSelection={Boolean(canAct&&active&&selectedId!==active.id)}
    onSelectActive={active?()=>setSelectedId(active.id):undefined}/>
   {savedPanel}
   {dndMode&&!sandbox&&isDndBattle(frame)&&frame.phase==='active'&&<details className="battle-surface"
    aria-label="Gerenciamento de tropas durante a batalha D&D">
    <summary>Gerenciar criaturas, reforços e resultado</summary>
    <p>Altere o efetivo sem encerrar a partida. Cada ajuste é registrado no replay.
     Os resultados não afetam as Casas.</p>
    {inspected&&<div className="dnd-cormyr-add-controls">
     <label>Quantidade de {inspected.name}
      <input aria-label="Quantidade em combate D&D" type="number"
       min={0} max={1000} value={adminCount}
       onChange={e=>setAdminCount(Number(e.target.value))}/></label>
     <Button variant="outline" onClick={()=>frame.activeStackId&&adminCommand({
      type:'DND_SET_COUNT',unitId:frame.activeStackId,
      targetId:inspected.id,count:adminCount})}>Aplicar quantidade</Button>
     <Button variant="outline" onClick={()=>frame.activeStackId&&adminCommand({
      type:'DND_WITHDRAW',unitId:frame.activeStackId,
      targetId:inspected.id})}>Retirar unidade do campo</Button>
    </div>}
    <div className="dnd-cormyr-add-controls">
     <label>Modelo de reforço
      <select aria-label="Modelo de reforço D&D" value={reinforceTemplate}
       onChange={e=>setReinforceTemplate(e.target.value)}>
       {[...new Map([...DND_MILITARY_CREATURES,...dndAllMonsters,
        ...frame.stacks.map(s=>s.template)].map(t=>[t.id,t])).values()]
        .map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
     </label>
     <label>Lado do reforço
      <select aria-label="Lado do reforço D&D" value={reinforceSide}
       onChange={e=>setReinforceSide(e.target.value as 'attacker'|'defender')}>
       <option value="attacker">Atacante</option><option value="defender">Defensor</option>
      </select>
     </label>
     <label>Quantidade de reforços
      <input aria-label="Quantidade de reforços D&D" type="number"
       min={1} max={1000} value={reinforceCount}
       onChange={e=>setReinforceCount(Number(e.target.value))}/></label>
     <Button variant="outline" onClick={addReinforcement}>Adicionar reforços</Button>
    </div>
    <div className="dnd-cormyr-add-controls">
     <label>Resultado definido pelo Narrador
      <select aria-label="Vencedor D&D" value={dndWinner}
       onChange={e=>setDndWinner(e.target.value as 'attacker'|'defender'|'draw')}>
       <option value="draw">Sem vencedor</option>
       <option value="attacker">Vitória dos atacantes</option>
       <option value="defender">Vitória dos defensores</option>
      </select>
     </label>
     <Button variant="outline" onClick={()=>frame.activeStackId&&adminCommand({
      type:'DND_END_BATTLE',unitId:frame.activeStackId,
      winner:dndWinner==='draw'?null:dndWinner,
     })}>Encerrar combate D&D</Button>
    </div>
   </details>}
   <section className="crz-turn-track" aria-label="Ordem de combate">
    <div className="crz-track-title">
     <h2>Ordem de combate</h2>
     <span>Selecione uma tropa; Tab entra no mapa e as setas navegam entre células</span>
    </div>
    <div className="crz-turn-cards">
     {turnOrder.map((unit,index)=><button type="button" key={unit.id}
      className={'crz-turn-card crz-faction-'+unit.side+
       (unit.id===frame.activeStackId?' crz-turn-current':'')+
       (unit.id===hoveredId?' crz-turn-hovered':'')}
      aria-label={'Ordem '+(index+1)+': '+unit.name+
       ' · '+SIDE[unit.side].name+' · '+unit.alive+' vivos'}
      aria-current={unit.id===frame.activeStackId?'step':undefined}
      aria-pressed={selectedId===unit.id}
      onMouseEnter={()=>setHoveredId(unit.id)}
      onMouseLeave={()=>setHoveredId(current=>current===unit.id?null:current)}
      onFocus={()=>setHoveredId(unit.id)}
      onBlur={()=>setHoveredId(current=>current===unit.id?null:current)}
      onClick={()=>setSelectedId(unit.id)}>
      <span className="crz-turn-number">{index+1}</span>
      <span className="crz-turn-symbol" aria-hidden="true">
       {unit.rangedRoutine?'⌖':'⚔'}</span>
      <strong>{unit.name}</strong>
      <small>{unit.alive} vivos</small>
     </button>)}
    </div>
   </section>
   <div className="crz-battle-columns">
    <section className="crz-general-deck" aria-label={dndMode?'Painel de combate básico D&D':'Painel do General CRZ'}>
     {dndMode?<div className="dnd-basic-panel">
      <h2>Combate básico D&D</h2>
      <p>Somente movimento e ataque simples por enquanto. Habilidades especiais,
       magia e ações lendárias ficam para uma próxima fase.</p>
     </div>:<>
     <BattleCommanderPortrait id={caster?.side==='defender'?'ashkar-raider':'tillet'}
      className="crz-portrait" eager/>
     <h2>General</h2>
     <strong className="crz-general-name">{caster?.name??'Sem General ativo'}</strong>
     <div className="crz-general-energy">
      <span>Energia</span>
      <strong>{caster?caster.energy+'/'+caster.energyMax:'—'}</strong>
     </div>
     <h3>Habilidades</h3>
     <section className="crz-general-spells">
      <label>Magia preparada
       <select aria-label="Magia do General" value={selectedSpell}
        disabled={!canAct||!spells.length}
        onChange={e=>{setSpell(e.target.value as CrzSpellId);setSpellTarget('');}}>
        {(caster?.spells??[]).filter(id=>CRZ_ADVANCED_SPELLS.includes(id)).map(id=>
         <option key={id} value={id}>{SPELL_LABELS[id]??id}</option>)}
       </select>
      </label>
      {!globalSpell(selectedSpell)&&<label>Alvo da magia
       <select aria-label="Alvo da magia" value={spellTarget}
        disabled={!canAct} onChange={e=>setSpellTarget(e.target.value)}>
        <option value="">Selecione uma pilha</option>
        {targets.map(t=><option key={t.id} value={t.id}>
         {t.name} · {count(t)}</option>)}
       </select>
      </label>}
      <Button className="crz-action-primary"
       disabled={!canCast||(!globalSpell(selectedSpell)&&!spellTarget)}
       onClick={cast}>Conjurar ({spellCost[selectedSpell]??'?'} energia)</Button>
     </section>
     <div className="crz-general-ability-buttons">
      {abilities.map(c=><Button key={c.ability} variant="outline"
       onClick={()=>apply(c)}>{c.ability==='CHARGE'?'Preparar carga':
        c.ability==='VOLLEY'?'Preparar salva':'Preparar evasão'}</Button>)}
     </div>
     </>}
     <div className="crz-command-footer">
      <h3>Decisão do turno</h3>
      <p className="battle-unified-action-hint">{dndMode?
       'V3: ataque simples e um movimento, em qualquer ordem. Após atacar, mova ou encerre a ativação. À distância sem teto, com linha de visão.':
       'Mover: toque no quadrado verde. Atacar: selecione o inimigo destacado.'}</p>
      {aiTurn&&<Button variant="outline" onClick={()=>{
       if(!session)return;
       try{
        const next=crzTrainingAdvanceAi(session);
        setSession(next);setSelectedId(next.state.activeStackId);
        setError('');setMessage('Turnos da IA registrados no replay.');
       }catch(cause){
        setError(cause instanceof Error?cause.message:'Não foi possível avançar a IA.');
       }
      }}>Executar turno da IA</Button>}
      {(['WAIT','DEFEND','END_ACTIVATION'] as const).map(type=>{
       const cmd=legal.find(c=>c.type===type);
       return <Button key={type} variant="outline" disabled={!canAct||!cmd}
        onClick={()=>cmd&&apply(cmd)}>
        {type==='WAIT'?'Esperar':type==='DEFEND'?'Defender':'Encerrar ativação'}
       </Button>;
      })}
     </div>
    </section>
    <section className="crz-central-map" aria-label="Campo de batalha">
     <div className="crz-map-caption">
      <h2>Campo de batalha</h2>
      <span className="battle-unified-leader-label">General: {caster?.name??"Nenhum ativo"}</span>
      <span className="crz-legend-item"><i className="crz-legend-green"/>Movimento</span>
      <span className="crz-legend-item"><i className="crz-legend-red"/>Ataque legal</span>
     </div>
     <CrzBoard state={frame} selectedId={selectedId}
      hoveredId={hoveredId}
      moves={canAct&&selectedId===active?.id?moves.map(c=>c.to):[]}
      attacks={canAct&&selectedId===active?.id?attacks.map(c=>c.targetId):[]}
      objectives={objectives} onTile={clickHex}/>
     {inspected&&<div className="crz-inspect-line">
      <strong>{inspected.name}</strong>
      <span>{SIDE[inspected.side].name} · {inspected.alive}/{inspected.initialCount} vivos</span>
      <span>{inspected.hpPool} PV · CA {inspected.acBase}</span>
      {dndMode&&<section className="dnd-inspected-stats" aria-label="Ficha D&D da pilha">
       <strong>Ficha D&D · d20</strong>
       <span>PV por criatura: {inspected.hpPerCreature} · PV da pilha: {inspected.hpPool}</span>
       <span>Classe de Armadura (CA): {inspected.acBase}</span>
       <span>Iniciativa (d20 + modificadores): {inspected.initiative}</span>
       <span>Deslocamento: {inspected.template.speedFt.walk} pés terrestres
        {inspected.template.flags.flying?' · Voo '+inspected.template.speedFt.fly+' pés (sobre obstáculos)':''}
        · {inspected.movementHex} quadrados</span>
       <span>Corpo a corpo: {inspected.meleeRoutine?
        inspected.meleeRoutine.steps.map(a=>{
         const hit=inspected.template.attacks.find(x=>x.id===a.attackId);
         return hit?hit.name+' '+((hit.toHit??0)+inspected.atkMod>=0?'+':'')+
          ((hit.toHit??0)+inspected.atkMod)+' ('+hit.damage.map(d=>
           d.dice+(d.mod>=0?'+':'')+d.mod).join(', ')+')':'—';
        }).join('; '):'—'}</span>
       <span>À distância: {inspected.rangedRoutine?
        inspected.rangedRoutine.steps.map(a=>{
         const hit=inspected.template.attacks.find(x=>x.id===a.attackId);
         return hit?hit.name+' '+((hit.toHit??0)+inspected.atkMod>=0?'+':'')+
          ((hit.toHit??0)+inspected.atkMod)+' · à distância, sem limite no mapa':'—';
        }).join('; '):'—'}</span>
       <span>Quantidade empilhada: {inspected.alive} /
        {inspected.initialCount} · PV da criatura ferida: {inspected.topHp}</span>
       {inspected.warnings.filter(w=>/provisóri[oa]|provisório|PROVISÓRIO/i.test(w))
        .map((warning,i)=><span key={i} className="battle-note">{warning}</span>)}
      </section>}
      {!dndMode&&<span>{inspected.moraleState==='routed'?'Debandada':
       inspected.moraleState==='shaken'?'Abalada':'Firme'}</span>}
     </div>}
    </section>
    <aside className="crz-last-actions" aria-label="Painel de informações CRZ">
     <div className="crz-right-tabs" role="group" aria-label="Informações da batalha">
      {([['actions','Ações'],['objectives','Marcos'],['report','Relatório'],
       ['replay','Replay']] as const).map(([id,label])=>
       <button type="button" key={id} aria-pressed={panel===id}
        className={panel===id?'crz-tab-active':''}
        onClick={()=>setPanel(id)}>{label}</button>)}
     </div>
     {panel==='actions'&&<section aria-label="Últimas ações">
      <h2>Últimas ações</h2>
      <ol className="crz-action-feed" aria-live="polite">
       {frame.events.slice(-6).reverse().map(event=><li key={event.seq}
        className={'crz-feed-'+event.type.toLowerCase()}>
        {eventLabel(event)}
       </li>)}
      </ol>
      <p className="crz-right-note">Os resultados são fictícios e não alteram
       as fichas das casas.</p>
     </section>}
     {panel==='objectives'&&<section aria-label="Marcos de observação CRZ">
      <h2>Marcos de observação</h2>
      <p>Os marcos não alteram condições de vitória.</p>
      <ol className="crz-objectives">{objectives.map(o=><li key={o.id}>
       <strong>{o.title}</strong>
       <span>{o.holder?SIDE[o.holder].name:'Livre'} ·
        hex {crzGridToOffset(frame.map,o.position).column},{crzGridToOffset(frame.map,o.position).row}</span>
      </li>)}</ol>
     </section>}
     {panel==='report'&&report&&<section aria-label="Relatório pós-batalha CRZ">
      <h2>Relatório de combate</h2>
      <table className="crz-report-table">
       <thead><tr><th>Força</th><th>Vivos</th><th>Baixas</th>
        <th>Dano</th><th>{dndMode?'Retiradas':'Magias'}</th></tr></thead>
       <tbody>{(['attacker','defender'] as const).map(side=>{
        const data=report.sides[side];return <tr key={side}>
         <th scope="row">{SIDE[side].name}</th>
         <td>{data.survivors}/{data.initialCreatures}</td>
         <td>{data.casualties}</td><td>{data.inflictedDamage}</td>
         <td>{dndMode?data.routedStacks:data.spellsCast}</td>
        </tr>;
       })}</tbody>
      </table>
      <Button variant="outline" onClick={exportReport}>Exportar relatório JSON</Button>
     </section>}
     {panel==='replay'&&<section aria-label="Replay CRZ">
      <h2>Replay verificável</h2>
      <p>Reprodução local protegida pela cadeia SHA-256.</p>
      <div className="crz-replay-tools">
       <Button variant="outline" onClick={()=>setReplayStep(0)}>
        Revisar desde o início</Button>
       <Button variant="outline" disabled={replayStep===null||replayStep===0}
        onClick={()=>setReplayStep(n=>n===null?0:Math.max(0,n-1))}>
        Anterior</Button>
       <Button variant="outline" disabled={replayStep===null||
        replayStep>=session.replay.steps.length}
        onClick={()=>setReplayStep(n=>n===null?0:
         Math.min(session.replay.steps.length,n+1))}>
        Próximo</Button>
       {replayStep!==null&&<Button onClick={()=>setReplayStep(null)}>
        {session.state.phase==='completed'?'Voltar ao resultado':'Retomar treino'}
       </Button>}
       <output aria-label="Posição do replay">
        {replayStep??session.replay.steps.length} / {session.replay.steps.length}
       </output>
      </div>
     </section>}
    </aside>
   </div>
   <footer className="crz-arena-guide">
    <strong>Como jogar</strong>
    <span>Selecione a unidade da vez para destacá-la em verde.</span>
    <span>Clique num quadrado verde para mover.</span>
    <span>Clique num inimigo com contorno vermelho para atacar.</span>
   </footer>
   {frame.phase==='completed'&&<div className="crz-victory-banner" role="status">
    Resultado: {frame.winner?SIDE[frame.winner].name:'Empate'} · {frame.resultReason==='withdrawal'?'retirada':frame.resultReason==='narrator-end'?
    'encerramento pelo Narrador':frame.resultReason}
   </div>}
  </section>}
 </section>;
 return <BattleExpandedView expanded={expanded&&Boolean(session)}
  onClose={()=>setExpanded(false)}>{arena}</BattleExpandedView>;
}
