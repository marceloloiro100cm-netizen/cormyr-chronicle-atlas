import {useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleCommand,BattleStack,Hex,Side} from '@/lib/battle/domain/types';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import {livingCount} from '@/lib/battle/domain/morale';
import {battleReport} from '@/lib/battle/domain/report';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {BattleBoard,type BattleBoardAppearance} from './BattleBoard';
import {BattleV36Initiative,BattleV36CommanderPanel,BattleV36ActionBar} from './BattleV36Hud';
import {BattleV3Barracks} from './BattleV3Barracks';
import {BattleV3CommanderHall} from './BattleV3CommanderHall';
import {BattleV3StrategyBoard} from './BattleV3StrategyBoard';
import {v3BarracksBySide,v3BarracksFromHouse,v3BarracksDeploy,
 type V3BarracksArmy} from '@/lib/battle/v3/barracks';
import {V3_COMMANDERS,commander,type CommanderId} from '@/lib/battle/v3/commanders';
import {MODEL_HOUSES,modelHouse} from '@/lib/battle/v3/model-houses';
import {v3NewCommanderProgress,v3ChooseCommanderTalent,v3AwardCommanderXp,
 v3TrainingReward,type V3CommanderProgress} from '@/lib/battle/v3/commander-progression';
import {createV3Game,v3PlayCommand,v3LegalSkills,v3UseUnitSkill,
 v3CanUseCommander,v3UseCommander,v3RunAi,type V3Game,type V3ScenarioOptions,
 type V3UnitSkill} from '@/lib/battle/v3/engine';
import {v37Enable,v37Cast,v37CastSignature,v37RunAi,v37CanSignature,
 V37_ABILITIES} from '@/lib/battle/v3/tactics-v37';
import './battle.css';

type Mode='inspect'|'move'|'attack'|'skill'|'power'|'tactic';
const sides:{id:Side;label:string}[]=[{id:'attacker',label:'Aliado'},{id:'defender',label:'Oponente'}];
const defaults:V3ScenarioOptions={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon',defenderCommander:'ashkar-raider',
 scenario:'plain-open',opponent:'ai',
};
function Troop({unit,selected,active,onSelect}:{unit:BattleStack;selected:boolean;active:boolean;onSelect:()=>void}){
 const alive=livingCount(unit);
 return <button type="button" className={'crusade-troop'+(selected?' selected':'')+(active?' active':'')}
  onClick={onSelect} aria-pressed={selected}>
  <span className="crusade-troop-title">{active?'◆ ':''}{unit.name}</span>
  <span className="crusade-troop-count">{alive}/{unit.initialCount} soldados</span>
  <span className="crusade-life-track"><span style={{width:Math.floor(100*unit.currentHp/(unit.initialCount*unit.hpPerSoldier))+'%'}}/></span>
  <small>{unit.moraleState==='routed'?'⚑ Em retirada':unit.moraleState==='shaken'?'Moral abalada':'Moral firme'}</small>
 </button>;
}
/** Interface original de Cormyr: ritmo de turnos e leitura de pilhas inspirados no
 * gênero de batalhas de Cruzada, sem reutilizar arte, ícones ou UI proprietária. */
export function BattleV3Game({narrator=false,onBack,initialOptions,locked=false,invitationName}:{
 narrator?:boolean;onBack?:()=>void;
 initialOptions?:V3ScenarioOptions;locked?:boolean;invitationName?:string;
}){
 const [options,setOptions]=useState<V3ScenarioOptions>(initialOptions??defaults);
 const [progressions,setProgressions]=useState<Record<CommanderId,V3CommanderProgress>>(()=>
  Object.fromEntries(V3_COMMANDERS.map(c=>[c.id,v3NewCommanderProgress()])) as Record<CommanderId,V3CommanderProgress>);
 const rewardedRef=useRef<V3Game|null>(null);
 const [armies,setArmies]=useState<Record<Side,V3BarracksArmy>>(()=>v3BarracksBySide(
  (initialOptions??defaults).attackerHouseId,(initialOptions??defaults).defenderHouseId));
 const [game,setGame]=useState<V3Game|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [mode,setMode]=useState<Mode>('inspect');
 const [appearance,setAppearance]=useState<BattleBoardAppearance>('illustrated');
 const [skill,setSkill]=useState<V3UnitSkill|null>(null);
 const [tacticId,setTacticId]=useState<string|null>(null);
 const [status,setStatus]=useState('');
 const [showManual,setShowManual]=useState(false);
 const [showDetails,setShowDetails]=useState(false);
 const [showStrategy,setShowStrategy]=useState(false);
 const update=(patch:Partial<V3ScenarioOptions>)=>setOptions(x=>({...x,...patch}));
 const begin=()=>{
  try{
   const rosters=locked?undefined:{
    attacker:v3BarracksDeploy(armies.attacker),
    defender:v3BarracksDeploy(armies.defender),
   };
   const trained=locked?undefined:{attacker:progressions[options.attackerCommander],
    defender:progressions[options.defenderCommander]};
   const created=createV3Game({...options,...(rosters?{rosters}:{}),
    ...(trained?{progressions:trained}:{})});
   const prepared=locked?created:v37Enable(created);
   setGame(prepared);setShowStrategy(false);setSelected(prepared.battle.activeUnitId);setMode('inspect');
   setStatus('Encontro iniciado. Cada token representa um agrupamento completo.');
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível criar o cenário-modelo.');}
 };
 const battle=game?.battle,active=battle?.stacks.find(s=>s.id===battle.activeUnitId);
 const inspected=battle?.stacks.find(s=>s.id===selected)??active;
 const canAct=Boolean(battle?.phase==='active'&&active&&battle.controls[active.side]==='human');
 const legal=useMemo(()=>battle?.phase==='active'?getLegalActions(battle):[],[battle]);
 const moves=legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK');
 const availableSkills=game?v3LegalSkills(game):[];
 const currentCommander=active&&game?commander(game.commanders[active.side]):null;
 const canPower=Boolean(game&&canAct&&(game.tactics?v37CanSignature(game):v3CanUseCommander(game)));
 const chosenTactic=V37_ABILITIES.find(a=>a.id===tacticId);
 const tacticTargets=battle?.stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
  active&&chosenTactic&&(chosenTactic.target==='ally'?s.side===active.side:s.side!==active.side))??[];
 const powerTargets=battle?.stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&active&&currentCommander&&
  (currentCommander.powerTarget==='ally'?s.side===active.side:s.side!==active.side))??[];
 const finish=(next:V3Game)=>{
  setGame(next);setSelected(next.battle.activeUnitId);
  setMode('inspect');setSkill(null);setTacticId(null);
 };
 const action=(cmd:BattleCommand)=>{
  if(!game)return;
  try{finish(v3PlayCommand(game,cmd));setStatus('Ordem aplicada com sucesso.');}
  catch(e){setStatus(e instanceof Error?e.message:'Ordem recusada.');}
 };
 const cast=(targetId:string)=>{
  if(!game)return;
  try{
   if(mode==='power'){
    finish(game.tactics?v37CastSignature(game,targetId):v3UseCommander(game,targetId));
    setStatus('Ordem do comandante cumprida.');
   }else if(mode==='tactic'&&tacticId){
    finish(v37Cast(game,tacticId,targetId));setStatus('Estratagema de comando executado.');
   }else if(mode==='skill'&&skill){
    finish(v3UseUnitSkill(game,skill,targetId));setStatus('Habilidade executada.');
   }
  }catch(e){setStatus(e instanceof Error?e.message:'Habilidade indisponível.');}
 };
 const clickHex=(hex:Hex)=>{
  if(!game||!battle)return;
  const target=battle.stacks.find(s=>s.currentHp>0&&hexKey(s.position)===hexKey(hex));
  if(canAct&&mode==='move'&&active){
   const cmd=moves.find(m=>hexKey(m.to)===hexKey(hex));
   if(cmd)action(cmd);else setStatus('Destino fora do alcance, ocupado ou bloqueado.');return;
  }
  if(canAct&&mode==='attack'&&target&&active){
   if(attacks.some(a=>a.targetId===target.id))action({type:'ATTACK',unitId:active.id,targetId:target.id});
   else setStatus('Alvo fora do alcance ou sem linha de visão.');return;
  }
  if(canAct&&(mode==='power'||mode==='skill'||mode==='tactic')){
   if(target)cast(target.id);else setStatus('Selecione uma tropa para aplicar a habilidade.');return;
  }
  if(target){setSelected(target.id);setMode('inspect');}
 };
 useEffect(()=>{
  if(!game||game.battle.phase!=='completed'||locked||rewardedRef.current===game)return;
  rewardedRef.current=game;
  setProgressions(previous=>{
   const next={...previous};
   for(const side of sides){
    if(game.battle.controls[side.id]!=='human')continue;
    const id=game.commanders[side.id];
    next[id]=v3AwardCommanderXp(next[id],v3TrainingReward(
     game.battle.winner,side.id,game.battle.round));
   }
   return next;
  });
 },[game,locked]);
 useEffect(()=>{
  if(!game)return;
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  if(game.battle.phase!=='active'||!actor||game.battle.controls[actor.side]!=='ai')return;
  try{const advanced=game.tactics?v37RunAi(game):v3RunAi(game);
   setGame(advanced);setSelected(advanced.battle.activeUnitId);}
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
     return <article className="crusade-side-card" key={s.id}>
      <p className="battle-eyebrow">{s.label==='Aliado'?'SEU EXÉRCITO':'EXÉRCITO ADVERSÁRIO'}</p>
      <label>Casa modelo<select aria-label={'Casa modelo '+s.label} value={options[key]} disabled={locked}
       onChange={e=>{
        update({[key]:e.target.value});
        setArmies(prev=>({...prev,[s.id]:v3BarracksFromHouse(e.target.value)}));
       }}>
       {MODEL_HOUSES.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
      </select></label>
      <h3>{chosen.subtitle}</h3><p>{chosen.description}</p>
      {locked?<div className="crusade-model-roster">
       {chosen.units.map(u=><span key={u.name}>{u.name} <b>×{u.count}</b></span>)}
      </div>:<BattleV3Barracks label={s.label} army={armies[s.id]}
       onChange={army=>setArmies(prev=>({...prev,[s.id]:army}))}/>}
      <label>Comandante<select aria-label={'Comandante '+s.label} value={leader.id} disabled={locked}
       onChange={e=>update({[ckey]:e.target.value as CommanderId})}>
       {V3_COMMANDERS.map(c=><option key={c.id} value={c.id}>{c.name} · {c.style}</option>)}
      </select></label>
      <div className="crusade-commander-card"><strong>{leader.name}</strong>
       <small>{leader.title} · {leader.style}</small>
       <p>{leader.lore}</p><p><b>{leader.powerName}:</b> {leader.powerDescription}</p>
      </div>
      {!locked&&<BattleV3CommanderHall id={leader.id} progress={progressions[leader.id]}
       onChoose={talent=>{
        try{
         const next=v3ChooseCommanderTalent(leader.id,progressions[leader.id],talent);
         setProgressions(old=>({...old,[leader.id]:next}));
         setStatus('Talento de treinamento adquirido.');
        }catch(e){setStatus(e instanceof Error?e.message:'Talento indisponível.');}
       }}/>} 
     </article>;
    })}
   </div>
   {!locked&&<div className="battle-home-actions">
    <Button variant="outline" onClick={()=>{
     if(showStrategy){setShowStrategy(false);return;}
     try{
      v3BarracksDeploy(armies.attacker);v3BarracksDeploy(armies.defender);
      setShowStrategy(true);setStatus('Mapa operacional de treino aberto.');
     }catch(e){setStatus(e instanceof Error?e.message:'Configure o quartel primeiro.');}
    }}>{showStrategy?'Ocultar mapa estratégico':'Planejar Cruzada · Mapa estratégico'}</Button>
   </div>}
   {showStrategy&&!locked&&<BattleV3StrategyBoard
    attackerCount={armies.attacker.filter(s=>s.placement==='field').reduce((t,s)=>t+s.count,0)}
    defenderCount={armies.defender.filter(s=>s.placement==='field').reduce((t,s)=>t+s.count,0)}
    opponent={options.opponent} onClose={()=>setShowStrategy(false)}/>}
   <div className="battle-form-row">
    <label>Cenário<select value={options.scenario} aria-label="Cenário da Cruzada" disabled={locked}
     onChange={e=>update({scenario:e.target.value as BattleScenarioId})}>
      {Object.entries(SCENARIOS).map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Controle adversário<select value={options.opponent} aria-label="Controle do adversário" disabled={locked}
     onChange={e=>update({opponent:e.target.value as 'ai'|'human'})}>
      <option value="ai">Inteligência artificial</option><option value="human">Dois comandantes no mesmo dispositivo</option>
    </select></label>
   </div>
   {status&&<p role="status">{status}</p>}
   <div className="battle-home-actions"><Button onClick={begin}>Batalhar</Button>
    {onBack&&<Button variant="outline" onClick={onBack}>Voltar</Button>}
   </div>
   <p className="battle-note">{narrator?'Visão de Narrador · ':'Visão de Jogador · '}Exércitos fictícios; esta partida não é uma batalha oficial convocada.</p>
  </section>
 </main>;
 const report=battle?battleReport(battle):null;
 return <main className="battle-module crusade-mode" aria-label="Arena Cruzada V3">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · CRUSADA TÁTICA · MODO SEPARADO</p>
   <h1>{battle?.name}</h1>
   <p>Rodada {battle?.round} · {active?active.name:'Batalha encerrada'} · PTE-3.0-SANDBOX</p>
   <p><strong>Simulação: as fichas das casas continuam intactas.</strong></p>
  </header>
  <BattleV36Initiative game={game} onInspect={id=>{setSelected(id);setMode('inspect');}}/>
  <div className="crusade-combat-grid crusade-v36-layout">
   <aside className="battle-surface crusade-left" aria-label="Ordem de batalha">
    <BattleV36CommanderPanel game={game} side={active?.side??'attacker'}
     active={active??null} canPower={canPower}
     onPower={()=>{setMode('power');setSkill(null);setTacticId(null);}}
     onTactic={id=>{setTacticId(id);setMode('tactic');setSkill(null);}}
     selectedTactic={mode==='tactic'?tacticId:null}/>
    <h2>Exércitos</h2>
    {sides.map(({id,label})=><section key={id}>
     <p className="crusade-side-title">{label}: {modelHouse(id==='attacker'?options.attackerHouseId:options.defenderHouseId).name}</p>
     <p className="crusade-commander-name">{commander(game.commanders[id]).name}</p>
     {battle?.stacks.filter(s=>s.side===id).map(s=><Troop key={s.id} unit={s}
      selected={selected===s.id} active={s.id===battle.activeUnitId}
      onSelect={()=>{setSelected(s.id);setMode('inspect');}}/>)}
    </section>)}
   </aside>
   <div className="battle-surface crusade-map">
    <div className="crusade-turn-banner" role="status">
     {battle?.phase==='completed'?'FIM DA BATALHA':
      'VEZ DE '+(active?.side==='attacker'?'SEU EXÉRCITO':'EXÉRCITO ADVERSÁRIO')}
     <span>{active?.name??'—'}</span>
    </div>
    <div className="crusade-v36-map-controls" role="group" aria-label="Estilo visual do mapa">
     <span>MAPA DE GUERRA</span>
     <Button size="sm" variant={appearance==='illustrated'?'default':'outline'}
      aria-pressed={appearance==='illustrated'} onClick={()=>setAppearance('illustrated')}>Ilustrado</Button>
     <Button size="sm" variant={appearance==='classic'?'default':'outline'}
      aria-pressed={appearance==='classic'} onClick={()=>setAppearance('classic')}>Tático</Button>
     <Button size="sm" variant={appearance==='contrast'?'default':'outline'}
      aria-pressed={appearance==='contrast'} onClick={()=>setAppearance('contrast')}>Alto contraste</Button>
    </div>
    <BattleBoard appearance={appearance} map={battle!.map} stacks={battle!.stacks} activeId={battle!.activeUnitId}
     selectedId={selected} moveKeys={mode==='move'&&canAct?moves.map(c=>hexKey(c.to)):[]}
     attackKeys={mode==='attack'&&canAct?attacks.map(c=>c.targetId):
      (mode==='power'&&canAct?powerTargets.map(s=>s.id):mode==='tactic'&&canAct?
       tacticTargets.map(s=>s.id):mode==='skill'&&canAct?
       battle!.stacks.filter(s=>s.side!==active?.side&&s.currentHp>0).map(s=>s.id):[])}
     onHexClick={clickHex}/>
    <p className="battle-note">
     {mode==='move'?'Clique no destino verde para mover.':
      mode==='attack'?'Clique no alvo vermelho para atacar.':
      mode==='power'?'Clique na tropa apropriada para o poder do comandante.':
      mode==='skill'?'Clique no inimigo para executar a habilidade.':
      mode==='tactic'?'Clique na unidade adequada para a ordem do comandante.':
      'Escolha uma ação; as pilhas são movidas por hexágonos e agem por iniciativa.'}
    </p>
    {status&&<p role="status" className="crusade-status">{status}</p>}
    {battle?.phase==='completed'&&report&&<div className="crusade-end">
     <h2>{battle.winner===null?'Empate':battle.winner==='attacker'?'Vitória aliada':'Vitória adversária'}</h2>
     <p>Baixas: aliados {report.bySide.attacker.casualties} · adversários {report.bySide.defender.casualties}</p>
     {!locked&&<p>Comandantes humanos receberam XP fictício. Ao iniciar outra Cruzada,
      abra a academia para escolher talentos liberados.</p>}
     <Button onClick={()=>{setGame(null);setStatus('');}}>Nova Cruzada</Button>
    </div>}
   </div>
   <aside className="battle-surface crusade-right" aria-label="Ordens táticas">
    <h2>Comando</h2>
    <p>{inspected?.name??'Selecione uma tropa'}</p>
    {inspected&&<div className="crusade-stats">
     <span>Combatentes <b>{livingCount(inspected)} / {inspected.initialCount}</b></span>
     <span>PV <b>{inspected.currentHp}</b></span>
     <span>Ataque / Defesa <b>{inspected.attack} / {inspected.defense}</b></span>
     <span>Movimento <b>{inspected.movementHex} hex</b></span>
     <span>Alcance <b>{inspected.rangeHex} hex</b></span>
    </div>}
    <div className="crusade-v36-orders-help">
     <h3>Leitura tática</h3>
     <p>As ordens ficam na barra inferior. Escolha uma ação e selecione
      o hexágono ou a unidade correspondente no mapa.</p>
     <p><b>{active?.name??'—'}</b> ·
      {canAct?' Controle humano ativo':' Aguardando o outro lado'}</p>
    </div>
    <div className="crusade-v36-quick-log" aria-label="Eventos recentes da batalha">
     <h3>Últimos eventos</h3>
     <ol>{[...game.log].slice(-4).reverse().map((event,i)=>
      <li key={i}>R{event.round} · {event.label}</li>)}</ol>
    </div>
    <Button size="sm" variant="outline" onClick={()=>setShowDetails(x=>!x)}>
     {showDetails?'Ocultar histórico':'Ver histórico'}
    </Button>
    <Button size="sm" variant="outline" onClick={()=>downloadBattleJson('crusada-v3-treino.json',
      JSON.stringify(game,null,2))}>Exportar treino JSON</Button>
    <Button size="sm" variant="outline" onClick={()=>{setGame(null);setStatus('');}}>Sair da batalha</Button>
    {onBack&&<Button size="sm" variant="outline" onClick={onBack}>Voltar ao painel</Button>}
   </aside>
  </div>
  <BattleV36ActionBar active={active??null} canAct={canAct}
   mode={mode} legal={legal} skills={availableSkills} skill={skill}
   onMode={next=>{setMode(next);setSkill(null);setTacticId(null);}}
   onSkill={ability=>{
    if(!game)return;
    if(ability==='SHIELD_WALL'){
     try{finish(v3UseUnitSkill(game,ability));setStatus('Formação defensiva aplicada.');}
     catch(e){setStatus(e instanceof Error?e.message:'Ordem inválida.');}
    }else{setSkill(ability);setMode('skill');}
   }}
   onAction={action}
   onFinish={()=>active&&action({type:'END_ACTIVATION',unitId:active.id})}
   onReset={()=>{setMode('inspect');setSkill(null);setTacticId(null);}}/>
  {showDetails&&<section className="battle-surface crusade-history" aria-label="Histórico tático V3">
   <h3>Registro de ordens</h3>
   <ol>{[...game.log].reverse().map((e,i)=><li key={i}>
     Rodada {e.round} · {e.side==='attacker'?'Aliados':'Adversários'} · {e.label}
    </li>)}</ol>
  </section>}
 </main>;
}
