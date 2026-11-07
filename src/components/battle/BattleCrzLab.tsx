import {useEffect,useMemo,useState,type ChangeEvent,type KeyboardEvent} from 'react';
import {Button} from '@/components/ui/button';
import {BattleExpandedView} from './BattleExpandedView';
import {BattleCommanderPortrait} from './BattleCommanderPortrait';
import {crzHexKey,crzGridToOffset,type CrzHex,type CrzSide,type CrzMap}
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

type SidePanel='actions'|'objectives'|'report'|'replay';
const SPELL_LABELS:Readonly<Record<string,string>>={
 bless:'Bênção',bane:'Maldição',shield_of_faith:'Escudo da fé',
 heroism:'Heroísmo',cause_fear:'Amedrontar',cure_wounds:'Curar ferimentos',
 firebolt:'Raio de fogo',fireball:'Bola de fogo (área)',shield_wall_formation:'Formação de escudos',
};
const TERRAIN:Readonly<Record<string,{name:string;fill:string}>>={
 plain:{name:'Planície',fill:'#a6a079'},
 forest:{name:'Bosque',fill:'#426953'},
 hill:{name:'Colina',fill:'#a88b5a'},
 rock:{name:'Rocha',fill:'#575960'},
};
const SIDE:Readonly<Record<CrzSide,{name:string;fill:string}>>={
 attacker:{name:'Coroa',fill:'#3e719e'},
 defender:{name:'Ashkar',fill:'#a85540'},
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
  STACK_DESTROYED:'Pilha destruída',BATTLE_ENDED:'Batalha encerrada',
  EXTRA_TURN_GRANTED:'Ativação extra',TURN_SKIPPED:'Turno perdido',
 };
 const extra='unitId' in event?event.unitId:
  'leaderId' in event?event.leaderId:'';
 const damage='appliedDamage' in event?' · '+event.appliedDamage+' PV':'';
 return '#'+event.seq+' '+(names[event.type]??event.type)+
  (extra?' · '+extra:'')+damage;
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
   setas navegam pelos células; Enter ou Espaço executam a ação. Use o zoom
   para ampliar sem alterar o tamanho das tropas.</p>
  <div className="crz-map-scroll" role="region" tabIndex={0}
  aria-label="Área navegável do mapa CRZ">
  <svg className="crz-map" viewBox={`0 0 ${width} ${height}`}
   style={{width:zoom+'%'}} role="group" aria-label={`Mapa CRZ ${state.map.width} por ${state.map.height}`}>
   {state.map.tiles.map(tile=>{
    const key=crzHexKey(tile),{x,y}=pixel(state.map,tile),unit=occupied.get(key),objective=objectivesByHex.get(key);
    const isMove=movable.has(key);
    const isAttack=Boolean(unit&&targets.has(unit.id));
    const active=unit?.id===state.activeStackId,selected=unit?.id===selectedId;
    const hovered=unit?.id===hoveredId;
    const label=(isMove?'Mover para ':isAttack?'Atacar ':'Inspecionar ')+
     (unit?unit.name+' · ':'')+TERRAIN[tile.terrain]!.name+
     ' ('+crzGridToOffset(state.map,tile).column+','+
       crzGridToOffset(state.map,tile).row+')'+
       (objective?' · Marco: '+objective.title:'');
    const press=()=>onTile({q:tile.q,r:tile.r});
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
      {square?<rect x={x-SQUARE_STEP/2} y={y-SQUARE_STEP/2} width={SQUARE_STEP}
       height={SQUARE_STEP} fill={TERRAIN[tile.terrain]!.fill}/>:
      <polygon points={HEX_POINTS} transform={`translate(${x} ${y})`}
       fill={TERRAIN[tile.terrain]!.fill}/>}
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
       <circle cx={x} cy={y} r={16}
        fill={SIDE[unit.side].fill} stroke={active?'#f9df9c':'#e4d8c2'}
        strokeWidth={active?3:1.4}/>
       <text x={x} y={y-3} textAnchor="middle" fill="#fff" fontSize={10}
        fontWeight={700} pointerEvents="none">{unit.alive}</text>
       <text x={x} y={y+9} textAnchor="middle" fill="#fff" fontSize={8}
        pointerEvents="none">{unit.id.slice(0,8)}</text>
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
 </div>;
}

const globalSpell=(spell:CrzSpellId)=>spell==='bless'||spell==='bane'||
 spell==='shield_wall_formation';
const enemySpell=(spell:CrzSpellId)=>spell==='cause_fear'||spell==='firebolt'||spell==='fireball';
const spellCost:Partial<Record<CrzSpellId,number>>={
 bless:3,bane:3,shield_of_faith:2,heroism:4,cause_fear:3,
 cure_wounds:2,firebolt:2,fireball:6,shield_wall_formation:2,
};

export function BattleCrzLab({onBack}:{onBack?:()=>void}){
 const [options,setOptions]=useState<CrzTrainingOptions>({...CRZ_TRAINING_DEFAULTS,grid:'square'});
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
 const [highContrast,setHighContrast]=useState(false);
 const [generalProfile,setGeneralProfile]=useState<TrainingGeneralProfile>(initialGeneralProfile);
 useEffect(()=>{setGeneralProfile(readGeneralTrainingProfile());},[]);
 const awardProgress=()=>{
  if(!session)return;
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
 const begin=()=>{
  try{
   const initial=crzReplayBegin(crzTrainingReady({...options,generalLevel:generalProfile.level}));
   const next=crzTrainingAdvanceAi(initial);
   setSession(next);setSelectedId(next.state.activeStackId);
   setPanel('actions');setReplayStep(null);setError('');setExpanded(true);
   setMessage('Treino fictício iniciado. Nenhuma ficha oficial será alterada.');
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
   setError('Hexágono fora do movimento permitido. Selecione um quadrado verde.');
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
  const file=event.currentTarget.files?.[0];
  if(!file)return;
  try{
   if(file.size>CRZ_REPLAY_MAX_BYTES)throw new Error('Arquivo maior que o limite de 8 MB.');
   const next=crzReplayParse(await file.text());
   setSession(next);setReplayStep(next.replay.steps.length);
   setSelectedId(next.state.activeStackId);setPanel('replay');setExpanded(true);
   setShowImport(false);setError('');
   setMessage('Replay validado. Use a linha do tempo ou retome o treino.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Replay não verificável.');
  }finally{event.currentTarget.value='';}
 };
 const reset=()=>{
  setExpanded(false);setSession(null);setReplayStep(null);setSelectedId(null);
  setError('');setMessage('');setPanel('actions');setHoveredId(null);
 };
 const arena=<section className={'battle-module crusade-mode crz-lab'+
  (highContrast?' crz-high-contrast':'')}
  aria-label="Laboratório CRZ-1.0 do Narrador">
  {!session&&<>
   <header className="battle-header crz-intro">
    <p className="battle-eyebrow">CORMYR · LABORATÓRIO DO NARRADOR</p>
    <h1>CRZ-1.0 · Cruzada Experimental</h1>
    <p>Treinamento tático com exércitos-modelo. Nenhum efeito em casas,
     baixas oficiais, contas ou no calendário.</p>
    <div className="crz-toolbar">
     {onBack&&<Button variant="outline" onClick={onBack}>Voltar ao módulo</Button>}
     <Button variant="outline" onClick={()=>setShowImport(v=>!v)}>
      Importar replay JSON
     </Button>
     <Button variant="outline" aria-pressed={highContrast}
      onClick={()=>setHighContrast(v=>!v)}>Alto contraste CRZ</Button>
    </div>
    {showImport&&<label className="crz-file">
     Arquivo de replay (máximo 8 MB)
     <input aria-label="Arquivo de replay CRZ" type="file"
      accept=".json,application/json" onChange={event=>{void importReplay(event);}}/>
    </label>}
   </header>
   {error&&<p className="crz-alert" role="alert">{error}</p>}
   {message&&<p className="crz-status" role="status">{message}</p>}
   <section className="battle-surface" aria-label="Preparar treino CRZ">
    <h2>Preparar batalha-modelo</h2>
    <p>Defensores da Coroa contra forças fictícias de Ashkar.</p>
    <div className="crz-form">
     <label>Conjunto de regras
      <select aria-label="Preset CRZ" value={options.preset??'CRZ-5E'}
       onChange={e=>setOptions(o=>({...o,preset:e.target.value as NonNullable<CrzTrainingOptions['preset']>,
        resolution:e.target.value==='CRZ-5E'?o.resolution:'expected'}))}>
       <option value="CRZ-5E">CRZ-5E</option>
       <option value="CRZ-WOTR">CRZ-WOTR (esperado)</option>
       <option value="PTE-2.0-compat">PTE-2.0-compat (esperado)</option>
      </select>
     </label>
     <label>Cenário
      <select value={options.scenario} aria-label="Cenário CRZ"
       onChange={e=>setOptions(o=>({...o,scenario:e.target.value as CrzTrainingOptions['scenario']}))}>
       {CRZ_TRAINING_SCENARIOS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
     </label>
     <label>Malha tática
      <select aria-label="Formato da malha CRZ" value={options.grid??'hex'}
       onChange={e=>setOptions(o=>({...o,grid:e.target.value as 'hex'|'square'}))}>
       <option value="square">Quadrados (novo padrão)</option>
       <option value="hex">Hexágonos (legado)</option>
      </select>
     </label>
     <label>Tamanho do mapa
      <select value={options.width} aria-label="Tamanho do mapa CRZ"
       onChange={e=>setOptions(o=>({...o,width:Number(e.target.value) as 11|15}))}>
       <option value={11}>11 × 9</option><option value={15}>15 × 11</option>
      </select>
     </label>
     <label>Resolução de dano
      <select value={options.resolution} aria-label="Resolução CRZ"
       onChange={e=>setOptions(o=>({...o,resolution:e.target.value as 'expected'|'hybrid'}))}>
       <option value="expected">Esperada (sem rolagens)</option>
       <option value="hybrid" disabled={(options.preset??'CRZ-5E')!=='CRZ-5E'}>Híbrida (PCG32)</option>
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
    <p className="battle-note">General Tillet · nível {generalProfile.level} · {generalProfile.xp} XP
     de treinamento local. O progresso não altera a Corte nem o exército.</p>
    <Button onClick={begin}>Iniciar treinamento CRZ</Button>
    <p className="battle-note">CRZ-WOTR e PTE-compat são simulações experimentais determinísticas,
     sem paridade oficial ou aplicação de baixas. Os replays registram o preset e seu hash.</p>
   </section>
  </>}
  {session&&frame&&<section className="crz-battle-stage"
   aria-label="Arena e comandos CRZ">
   <header className="crz-arena-head">
    <div className="crz-arena-heading">
     <span className="crz-eyebrow">CORMYR · ARENA DE TREINAMENTO</span>
     <h1>Cruzada <span>CRZ-1.0</span></h1>
     <p>Preset: {frame.rulesetId} · General Tillet nível {frame.leaders.attacker?.level??'—'} (treino)</p>
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
     {onBack&&<Button variant="outline" onClick={onBack}>Voltar</Button>}
     <Button variant="outline" onClick={reset}>Novo treino</Button>
     <Button variant="outline" onClick={exportReplay}>Exportar replay</Button>
     {session.state.phase==='completed'&&<Button variant="outline" onClick={awardProgress}>
      Registrar XP do General (treino)</Button>}
     <Button variant="outline" aria-pressed={highContrast}
      onClick={()=>setHighContrast(v=>!v)}>Alto contraste CRZ</Button>
     <Button variant="outline" onClick={()=>setShowImport(v=>!v)}>
      Importar replay
     </Button>
    </div>
   </header>
   {showImport&&<label className="crz-file">
    Importar replay CRZ (máximo 8 MB)
    <input type="file" accept=".json,application/json"
     aria-label="Arquivo de replay CRZ"
     onChange={event=>{void importReplay(event);}}/>
   </label>}
   {error&&<p className="crz-alert" role="alert">{error}</p>}
   {message&&<p className="crz-status" role="status">{message}</p>}
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
    <section className="crz-general-deck" aria-label="Painel do General CRZ">
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
     <div className="crz-command-footer">
      <h3>Decisão do turno</h3>
      <p className="battle-unified-action-hint">Mover: toque no quadrado verde. Atacar: selecione o inimigo destacado.</p>
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
      <span>{inspected.moraleState==='routed'?'Debandada':
       inspected.moraleState==='shaken'?'Abalada':'Firme'}</span>
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
        <th>Dano</th><th>Magias</th></tr></thead>
       <tbody>{(['attacker','defender'] as const).map(side=>{
        const data=report.sides[side];return <tr key={side}>
         <th scope="row">{SIDE[side].name}</th>
         <td>{data.survivors}/{data.initialCreatures}</td>
         <td>{data.casualties}</td><td>{data.inflictedDamage}</td>
         <td>{data.spellsCast}</td>
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
    Resultado: {frame.winner?SIDE[frame.winner].name:'Empate'} · {frame.resultReason}
   </div>}
  </section>}
 </section>;
 return <BattleExpandedView expanded={expanded&&Boolean(session)}
  onClose={()=>setExpanded(false)}>{arena}</BattleExpandedView>;
}
