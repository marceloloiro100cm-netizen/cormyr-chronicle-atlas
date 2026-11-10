import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleCommand,BattleStack,Hex,Side} from '@/lib/battle/domain/types';
import {getLegalActions,activationOrder} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import {fieldUnitAtHex} from '@/lib/battle/v3/field';
import {exportV3ReplayJson,parseV3ReplayJson} from '@/lib/battle/v3/replay';
import {livingCount} from '@/lib/battle/domain/morale';
import {battleReport} from '@/lib/battle/domain/report';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {V3MiniatureBoard} from './miniatures3d/V3MiniatureBoard';
import {MiniatureDemo} from './miniatures3d/MiniatureDemo';
import {BattleExpandedView} from './BattleExpandedView';
import {BattleTurnCue} from './BattleTurnCue';
import {BattleActionFeedback} from './BattleActionFeedback';
import {BattleOutcomeSummary} from './BattleOutcomeSummary';
import {BattleCommanderPortrait} from './BattleCommanderPortrait';
import {BattleHouseBanner,BattleHouseVersus} from './BattleHouseHeraldry';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import {V3_COMMANDERS,commander,type CommanderId} from '@/lib/battle/v3/commanders';
import {MODEL_HOUSES,modelHouse} from '@/lib/battle/v3/model-houses';
import {createV3Game,v3PlayCommand,v3LegalSkills,v3SkillName,v3UseUnitSkill,
 v3CanUseCommander,v3UseCommander,v3RunAi,type V3Game,type V3ScenarioOptions,
 type V3UnitSkill} from '@/lib/battle/v3/engine';
import './battle.css';
import './crusade-v4.css';
import './battle-legibility.css';
import './battle-ui-v4.css';
import './battle-arena-unified.css';

type Mode='inspect'|'skill'|'power';
const sides:{id:Side;label:string}[]=[{id:'attacker',label:'Aliado'},{id:'defender',label:'Oponente'}];
const defaults:V3ScenarioOptions={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon',defenderCommander:'ashkar-raider',
 scenario:'plain-open',opponent:'ai',grid:'square',
};
/** Interface original de Cormyr: ritmo de turnos e leitura de pilhas inspirados no
 * gênero de batalhas de Cruzada, sem reutilizar arte, ícones ou UI proprietária. */
export function BattleV3Game({narrator=false,onBack,initialOptions,locked=false,invitationName,officialCopies=[],officialHouseNames,officialHouseHeraldry}:{
 narrator?:boolean;onBack?:()=>void;
 initialOptions?:V3ScenarioOptions;locked?:boolean;invitationName?:string;
 officialCopies?:readonly BattleStack[];
 officialHouseNames?:Partial<Record<Side,string>>;
 officialHouseHeraldry?:Partial<Record<Side,BattleHouseDirectoryRow>>;
}){
 const [options,setOptions]=useState<V3ScenarioOptions>(initialOptions??defaults);
 const [game,setGame]=useState<V3Game|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [miniaturesEnabled,setMiniaturesEnabled]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [hoveredId,setHoveredId]=useState<string|null>(null);
 const [mode,setMode]=useState<Mode>('inspect');
 const [skill,setSkill]=useState<V3UnitSkill|null>(null);
 const [status,setStatus]=useState('');
 const [showManual,setShowManual]=useState(false);
 const [showDetails,setShowDetails]=useState(false);
 const [historySide,setHistorySide]=useState<'all'|Side>('all');
 const update=(patch:Partial<V3ScenarioOptions>)=>setOptions(x=>({...x,...patch}));
 const importReplay=async(file:File|undefined)=>{
  if(!file)return;
  try{
   if(locked)throw new Error('Convocação não permite importar partidas externas.');
   if(file.size>1_500_000)throw new Error('Replay V3 excede 1,5 MB.');
   const {game:restored}=parseV3ReplayJson(await file.text());
   setOptions(restored.setup);setGame(restored);setSelected(restored.battle.activeUnitId);
   setMode('inspect');setSkill(null);setExpanded(true);setMiniaturesEnabled(false);
   setStatus('Replay V3 verificado e retomado sem alterar as fichas oficiais.');
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível recuperar o replay V3.');}
 };
 const begin=()=>{
  try{
   const created=createV3Game(options,narrator?officialCopies:[]);
   setGame(created);setSelected(created.battle.activeUnitId);setMode('inspect');
   setExpanded(true);
   setStatus('Encontro iniciado. Cada token representa um agrupamento completo.');
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível criar o cenário-modelo.');}
 };
 const battle=game?.battle,active=battle?.stacks.find(s=>s.id===battle.activeUnitId);
 const inspected=battle?.stacks.find(s=>s.id===selected&&s.currentHp>0&&
  s.moraleState!=='routed')??(active&&active.currentHp>0&&
  active.moraleState!=='routed'?active:undefined);
 const canAct=Boolean(battle?.phase==='active'&&active&&battle.controls[active.side]==='human');
 const legal=useMemo(()=>battle?.phase==='active'?getLegalActions(battle):[],[battle]);
 const moves=legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK');
 const availableSkills=game?v3LegalSkills(game):[];
 const currentCommander=active&&game?commander(game.commanders[active.side]):null;
 const battleHouseNames:Record<Side,string>={
  attacker:officialHouseNames?.attacker||modelHouse(options.attackerHouseId).name,
  defender:officialHouseNames?.defender||modelHouse(options.defenderHouseId).name,
 };
 const canPower=Boolean(game&&canAct&&v3CanUseCommander(game));
 const powerTargets=battle?.stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&active&&currentCommander&&
  (currentCommander.powerTarget==='ally'?s.side===active.side:s.side!==active.side))??[];
 const finish=(next:V3Game)=>{
  setGame(next);setSelected(next.battle.activeUnitId);
  setMode('inspect');setSkill(null);
 };
 const action=(cmd:BattleCommand)=>{
  if(!game)return;
  try{finish(v3PlayCommand(game,cmd));setStatus('Ordem aplicada com sucesso.');}
  catch(e){setStatus(e instanceof Error?e.message:'Ordem recusada.');}
 };
 const cast=(targetId:string)=>{
  if(!game)return;
  try{
   if(mode==='power'){finish(v3UseCommander(game,targetId));setStatus('Ordem do comandante cumprida.');}
   else if(mode==='skill'&&skill){finish(v3UseUnitSkill(game,skill,targetId));setStatus('Habilidade executada.');}
  }catch(e){setStatus(e instanceof Error?e.message:'Habilidade indisponível.');}
 };
 /** Movimento e ataque são contextuais, mas o comando continua validado no motor.
  * Inspecionar tropas de outro turno não concede permissão para executá-las. */
 const clickHex=(hex:Hex)=>{
  if(!game||!battle)return;
  const target=fieldUnitAtHex(battle.stacks,hex);
  if(canAct&&(mode==='power'||mode==='skill')){
   if(target)cast(target.id);else setStatus('Selecione uma tropa para aplicar a habilidade.');
   return;
  }
  if(canAct&&mode==='inspect'&&active&&selected===active.id){
   const attack=target&&attacks.find(a=>a.targetId===target.id);
   if(attack){action(attack);return;}
   if(!target){
    const move=moves.find(m=>hexKey(m.to)===hexKey(hex));
    if(move){action(move);return;}
    setStatus('Destino indisponível: escolha um quadrado verde.');
    return;
   }
  }
  if(target){setSelected(target.id);setStatus('Tropa selecionada para inspeção.');}
 };
 useEffect(()=>{
  if(!game)return;
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  if(game.battle.phase!=='active'||!actor||game.battle.controls[actor.side]!=='ai')return;
  try{const advanced=v3RunAi(game);setGame(advanced);setSelected(advanced.battle.activeUnitId);}
  catch(e){setStatus(e instanceof Error?e.message:'Oponente não conseguiu jogar esta rodada.');}
 },[game]);
 if(!game)return <main className="battle-module crusade-mode" aria-label="Jogo de batalha V3">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · CRUSADA TÁTICA</p>
   <h1>{invitationName?'Batalha convocada':'Batalhar'}</h1>
   <p>{invitationName?'Convocação do Narrador: '+invitationName:
     'Escolha exércitos-modelo, generais e um terreno para jogar uma batalha por agrupamentos.'}</p>
   <p><strong>Modo de teste V3: nenhuma ação modifica casas, soldados, economia ou calendário.</strong></p>
  </header>
  <section className="battle-surface">
   <h2>Forças em confronto</h2>
   <div className="crusade-model-grid">
    {sides.map(s=>{
     const chosen=modelHouse(s.id==='attacker'?options.attackerHouseId:options.defenderHouseId);
     const key=s.id==='attacker'?'attackerHouseId':'defenderHouseId';
     const ckey=s.id==='attacker'?'attackerCommander':'defenderCommander';
     const leader=commander(options[ckey]);
     const sideCopies=narrator?officialCopies.filter(unit=>unit.side===s.id):[];
     return <article className="crusade-side-card" key={s.id}>
      <p className="battle-eyebrow">{s.label==='Aliado'?'SEU EXÉRCITO':'EXÉRCITO ADVERSÁRIO'}</p>
      {sideCopies.length>0?<div className="battle-house-selected-label">
       <BattleHouseBanner side={s.id} house={officialHouseHeraldry?.[s.id]}
        name={officialHouseNames?.[s.id]||'Casa cadastrada'} subtle/>
      </div>:
       <label>Casa modelo<select aria-label={'Casa modelo '+s.label} value={options[key]} disabled={locked}
        onChange={e=>update({[key]:e.target.value})}>
        {MODEL_HOUSES.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
       </select></label>}
      <h3>{sideCopies.length>0?'Exército da Casa selecionada':chosen.subtitle}</h3>
      <p>{sideCopies.length>0?'A casa-modelo deste lado foi substituída por cópias autorizadas, sem alterações na origem.':chosen.description}</p>
      <div className="crusade-model-roster">
       {sideCopies.length>0?
        sideCopies.map(u=><span key={u.id}>{u.name} <b>×{u.initialCount}</b></span>):
        chosen.units.map(u=><span key={u.name}>{u.name} <b>×{u.count}</b></span>)}
      </div>
      <label>Comandante<select aria-label={'Comandante '+s.label} value={leader.id} disabled={locked}
       onChange={e=>update({[ckey]:e.target.value as CommanderId})}>
       {V3_COMMANDERS.map(c=><option key={c.id} value={c.id}>{c.name} · {c.style}</option>)}
      </select></label>
      <div className="crusade-commander-card">
       <BattleCommanderPortrait id={leader.id}/>
       <strong>{leader.name}</strong>
       <small>{leader.title} · {leader.style}</small>
       <p>{leader.lore}</p><p><b>{leader.powerName}:</b> {leader.powerDescription}</p>
      </div>
     </article>;
    })}
   </div>
   <div className="battle-form-row">
    <label>Formato do mapa<select aria-label="Formato da malha V3"
     value={options.grid??'square'} disabled>
      <option value="square">Quadrados (novo padrão)</option>
      {/* Hexágonos históricos permanecem apenas nos replays antigos. */}
     </select></label>
    <label>Cenário<select value={options.scenario} aria-label="Cenário da Cruzada" disabled={locked}
     onChange={e=>update({scenario:e.target.value as BattleScenarioId})}>
      {Object.entries(SCENARIOS).map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Controle adversário<select value={options.opponent} aria-label="Controle do adversário" disabled={locked}
     onChange={e=>update({opponent:e.target.value as 'ai'|'human'})}>
      <option value="ai">Inteligência artificial</option><option value="human">Dois comandantes no mesmo dispositivo</option>
    </select></label>
   </div>
   {narrator&&<>
    <label className="battle-note"><input type="checkbox" checked={miniaturesEnabled}
     onChange={e=>setMiniaturesEnabled(e.target.checked)}/> Habilitar miniaturas 3D nesta sessão (teste)</label>
    <MiniatureDemo narrator={narrator}/>
   </>}
   {status&&<p role="status">{status}</p>}
   <div className="battle-home-actions"><Button onClick={begin}>Batalhar</Button>
    {onBack&&<Button variant="outline" onClick={onBack}>Voltar</Button>}
   </div>
   {narrator&&officialCopies.length>0&&<p className="battle-note">
    Treino com {officialCopies.length} cópia(s) documentada(s) somente para simulação;
    nenhuma baixa será aplicada à campanha.</p>}
   {!locked&&<label>Retomar batalha V3 verificada (JSON)
    <input type="file" accept=".json,application/json" aria-label="Importar replay V3"
     onChange={e=>{void importReplay(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
   </label>}
   <p className="battle-note">{narrator?'Visão de Narrador · ':'Visão de Jogador · '}
    {officialCopies.length?'Tropas oficiais copiadas somente para simulação.':'Exércitos fictícios.'}
    Esta partida não é uma batalha oficial convocada.</p>
  </section>
 </main>;
 const leaveBattle=()=>{
  if(game?.battle.phase==='active'&&
   !window.confirm('Esta batalha V3 não foi salva automaticamente. Deseja sair?'))return;
  onBack?.();
 };
 const report=battle?battleReport(battle):null;
 const orderIds=battle?[
  ...(battle.activeUnitId?[battle.activeUnitId]:[]),
  ...battle.activationQueue,...battle.waitingQueue,
  ...activationOrder(battle.stacks),
 ]:[];
 const turnOrder=battle?[...new Set(orderIds)].map(id=>
  battle.stacks.find(unit=>unit.id===id)).filter(
   (unit):unit is BattleStack=>Boolean(unit&&unit.currentHp>0&&unit.moraleState!=='routed')):[];
 const arena=<main className="battle-module crusade-mode crusade-v4" aria-label="Arena Cruzada V3">
  <section className="crusade-v4-stage" aria-label="Arena V4 unificada">
   <header className="crusade-v4-header">
    <div>
     <p className="crusade-v4-eyebrow">CORMYR · CRUZADA TÁTICA · TREINAMENTO</p>
     <h1>{officialCopies.length>0?
      battleHouseNames.attacker+' × '+battleHouseNames.defender:battle?.name}</h1>
     <BattleHouseVersus houses={officialHouseHeraldry} names={battleHouseNames}/>
     <p>Rodada {battle?.round} · {active?active.name:'Batalha encerrada'} ·
      PTE-3.0-SANDBOX</p>
    </div>
    <div className="crusade-v4-utility">
     {officialCopies.length===0&&game.battle.stacks.every(s=>s.source.kind==='fictional')?
      <Button variant="outline" onClick={()=>{
       try{downloadBattleJson('crusada-v3-replay-verificado.json',exportV3ReplayJson(game));}
       catch(e){setStatus(e instanceof Error?e.message:'Replay V3 indisponível.');}
      }}>Exportar replay V3 verificado</Button>:
      <span className="battle-note">Replay externo desativado para cópias militares de casas.</span>}
     <Button variant="outline" onClick={()=>{
      if(game.battle.phase==='active'&&
       !window.confirm('A batalha V3 atual será descartada. Continuar?'))return;
      setExpanded(false);setGame(null);setStatus('');
     }}>Nova batalha</Button>
     <Button variant="outline" className="battle-expand-toggle"
      aria-label={expanded?'Sair da tela ampliada':'Ampliar batalha'}
      onClick={()=>setExpanded(value=>!value)}>
      {expanded?'↙ Sair da tela ampliada':'⤢ Ampliar batalha'}
     </Button>
     {onBack&&<Button variant="outline" onClick={leaveBattle}>Voltar ao módulo</Button>}
    </div>
   </header>
   {game.log.length>0&&<BattleActionFeedback
    round={game.log[game.log.length-1]!.round}
    label={game.log[game.log.length-1]!.label}
    detail={game.log[game.log.length-1]!.detail}/>}
   <BattleTurnCue system="adapted" round={battle?.round??1}
    phase={battle?.phase??'active'} activeUnit={active?.name}
    canAct={canAct} moves={moves.length} attacks={attacks.length}
    needsSelection={Boolean(canAct&&active&&selected!==active.id)}
    onSelectActive={active?()=>{
     setSelected(active.id);setMode('inspect');setSkill(null);
    }:undefined}/>
   <section className="crusade-v4-turns" aria-label="Ordem de combate V3">
    <div className="crusade-v4-section-head">
     <h2>Ordem de combate</h2>
     <span>Selecione uma tropa; Tab entra no mapa e as setas navegam entre células</span>
    </div>
    <div className="crusade-v4-turn-strip">
     {turnOrder.map((unit,index)=><button type="button" key={unit.id}
      className={'crusade-v4-turn-card crusade-v4-'+unit.side+
       (unit.id===battle?.activeUnitId?' is-current':'')}
      aria-label={'Ordem '+(index+1)+': '+unit.name+' · '+livingCount(unit)+' soldados'}
      aria-current={unit.id===battle?.activeUnitId?'step':undefined}
      aria-pressed={selected===unit.id}
      onMouseEnter={()=>setHoveredId(unit.id)}
      onMouseLeave={()=>setHoveredId(value=>value===unit.id?null:value)}
      onFocus={()=>setHoveredId(unit.id)}
      onBlur={()=>setHoveredId(value=>value===unit.id?null:value)}
      onClick={()=>{setSelected(unit.id);setMode('inspect');setSkill(null);}}>
      <small>{index+1}</small>
      <span className="crusade-v4-unit-symbol" aria-hidden="true">
       {unit.rangeHex>1?'⌖':'⚔'}</span>
      <strong>{unit.name}</strong>
      <span>{livingCount(unit)} combatentes</span>
     </button>)}
    </div>
   </section>
   <div className="crusade-v4-columns">
    <section className="crusade-v4-general" aria-label="General e habilidades V3">
     {currentCommander&&<BattleCommanderPortrait id={currentCommander.id}
      className="crusade-v4-portrait" eager/>}
     <h2>General</h2>
     <strong className="crusade-v4-general-name">{currentCommander?.name??'Comandante indisponível'}</strong>
     <p className="crusade-v4-general-title">{currentCommander?.title??'—'}</p>
     <div className="crusade-v4-power-status">
      <span>Poder da batalha</span>
      <strong>{game.usedPowers[active?.side??'attacker']?'Utilizado':'Disponível'}</strong>
     </div>
     <h3>Habilidades</h3>
     {currentCommander&&<>
      <p className="crusade-v4-power-description">{currentCommander.powerDescription}</p>
      <Button className="crusade-v4-primary" variant="outline" disabled={!canPower}
       aria-pressed={mode==='power'}
       onClick={()=>{setMode(v=>v==='power'?'inspect':'power');setSkill(null);}}>
       {game.usedPowers[active?.side??'attacker']?'Poder já utilizado':currentCommander.powerName}
      </Button>
     </>}
     <h3>Habilidades de tropa</h3>
     {availableSkills.length===0?<p>Sem habilidade disponível nesta ativação.</p>:
      <div className="crusade-v4-skills">{availableSkills.map(ability=>
       <Button key={ability} variant="outline" disabled={!canAct}
        aria-pressed={mode==='skill'&&skill===ability}
        onClick={()=>{
         if(!game)return;
         if(ability==='SHIELD_WALL'){
          try{finish(v3UseUnitSkill(game,ability));setStatus('Formação defensiva aplicada.');}
          catch(e){setStatus(e instanceof Error?e.message:'Ordem inválida.');}
         }else{setSkill(ability);setMode('skill');}
        }}>{v3SkillName(ability)}</Button>
      )}</div>}
     {mode!=='inspect'&&<div className="crusade-v4-target-hint" role="status">
      Clique no alvo adequado no mapa.
      <Button variant="outline" onClick={()=>{setMode('inspect');setSkill(null);}}>Cancelar alvo</Button>
     </div>}
     <div className="crusade-v4-commands">
      <h3>Decisão do turno</h3>
      <p className="battle-unified-action-hint">Mover: toque no quadrado verde. Atacar: selecione o inimigo vermelho.</p>
      <Button disabled={!canAct||!active||!legal.some(c=>c.type==='DEFEND')} variant="outline"
       onClick={()=>active&&action({type:'DEFEND',unitId:active.id})}>Defender</Button>
      <Button disabled={!canAct||!active||!legal.some(c=>c.type==='WAIT')} variant="outline"
       onClick={()=>active&&action({type:'WAIT',unitId:active.id})}>Esperar</Button>
      <Button disabled={!canAct||!active} variant="outline"
       onClick={()=>active&&action({type:'END_ACTIVATION',unitId:active.id})}>Fim de turno</Button>
     </div>
    </section>
    <section className="crusade-v4-battlefield" aria-label="Campo de batalha V3">
     <div className="crusade-v4-map-head">
      <h2>Campo de batalha</h2>
      <span className="battle-unified-leader-label">General: {currentCommander?.name??"Sem General ativo"}</span>
      <span> <i className="crusade-v4-green"/> Movimento</span>
      <span> <i className="crusade-v4-red"/> Ataque legal</span>
     </div>
     <V3MiniatureBoard narrator={narrator} sessionEnabled={miniaturesEnabled}
      map={game.battle.map} stacks={game.battle.stacks} activeId={game.battle.activeUnitId}
      selectedId={selected} hoveredId={hoveredId} theme="cormyr"
      moveKeys={canAct&&mode==='inspect'&&selected===active?.id?
       moves.map(c=>hexKey(c.to)):[]}
      attackKeys={canAct&&mode==='inspect'&&selected===active?.id?
       attacks.map(c=>c.targetId):
       mode==='power'&&canAct?powerTargets.map(s=>s.id):
       mode==='skill'&&canAct?attacks.map(c=>c.targetId):[]}
      onHexClick={clickHex}/>
     <p className="crusade-v4-instruction">
      {mode==='power'?'Selecione a unidade para receber o poder do General.':
       mode==='skill'?'Selecione um alvo vermelho para executar a habilidade.':
       selected===active?.id?'Clique no quadrado verde para mover ou na unidade inimiga marcada para atacar.':
       'Selecione a unidade ativa na ordem de combate para comandá-la.'}
     </p>
     {inspected&&<div className="crusade-v4-inspector">
      <strong>{inspected.name}</strong>
      <span>{livingCount(inspected)}/{inspected.initialCount} soldados</span>
      <span>{inspected.currentHp} PV · Ataque {inspected.attack} · Defesa {inspected.defense}</span>
     </div>}
     {status&&<p role="status" className="crusade-v4-status">{status}</p>}
     {battle?.phase==='completed'&&report&&<div className="crusade-v4-end">
      <BattleOutcomeSummary
       title={battle.winner===null?'Empate':battle.winner==='attacker'?'Vitória aliada':'Vitória adversária'}
       round={battle.round}
       losses={[
        {label:'Aliados',count:report.bySide.attacker.casualties},
        {label:'Adversários',count:report.bySide.defender.casualties},
       ]}/>
      <Button onClick={()=>{setExpanded(false);setGame(null);setStatus('');}}>Nova Cruzada</Button>
     </div>}
    </section>
    <aside className="crusade-v4-history" aria-label="Últimas ações V3">
     <h2>Últimas ações</h2>
     <label className="crusade-v4-history-filter">Filtrar histórico
      <select aria-label="Filtrar histórico por facção" value={historySide}
       onChange={e=>setHistorySide(e.target.value as 'all'|Side)}>
       <option value="all">Ambos os exércitos</option>
       <option value="attacker">Aliados</option>
       <option value="defender">Adversários</option>
      </select>
     </label>
     <ol aria-live="polite" className="crusade-v4-log">
      {(showDetails?[...game.log].reverse().filter(e=>historySide==='all'||e.side===historySide):
       [...game.log].reverse().filter(e=>historySide==='all'||e.side===historySide).slice(0,6)).map((entry,i)=>
       <li key={game.log.length-i}>
        <strong>Rodada {entry.round}</strong>
        <span>{officialHouseNames?.[entry.side]||
        modelHouse(entry.side==='attacker'?game.setup.attackerHouseId:game.setup.defenderHouseId).name} · {entry.label}</span>
        {entry.detail&&<small>{entry.detail}</small>}
       </li>)}
     </ol>
     {game.log.length===0&&<p>Nenhuma ordem executada nesta batalha.</p>}
     <Button variant="outline" onClick={()=>setShowDetails(value=>!value)}>
      {showDetails?'Ver últimas ações':'Ver histórico completo'}
     </Button>
     <p className="crusade-v4-private-notice">
      {officialCopies.length>0?'Unidades de casas copiadas somente para treinamento.':
       'Exércitos-modelo de treinamento.'} As fichas oficiais não são alteradas.
     </p>
    </aside>
   </div>
   <footer className="crusade-v4-footnotes">
    <strong>Como jogar</strong>
    <span>Selecione a unidade da vez; ela ficará verde.</span>
    <span>Hexágono verde: mover. Inimigo destacado: atacar.</span>
    <span>O motor PTE-3.0 valida todos os comandos.</span>
   </footer>
  </section>
 </main>;
 return <BattleExpandedView expanded={expanded} onClose={()=>setExpanded(false)}>
  {arena}
 </BattleExpandedView>;
}
