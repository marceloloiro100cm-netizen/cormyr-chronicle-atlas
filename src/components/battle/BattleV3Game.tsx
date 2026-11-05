import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleCommand,BattleStack,Hex,Side} from '@/lib/battle/domain/types';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import {livingCount} from '@/lib/battle/domain/morale';
import {battleReport} from '@/lib/battle/domain/report';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {BattleBoard} from './BattleBoard';
import {V3_COMMANDERS,commander,type CommanderId} from '@/lib/battle/v3/commanders';
import {MODEL_HOUSES,modelHouse} from '@/lib/battle/v3/model-houses';
import {createV3Game,v3PlayCommand,v3LegalSkills,v3SkillName,v3UseUnitSkill,
 v3CanUseCommander,v3UseCommander,v3RunAi,type V3Game,type V3ScenarioOptions,
 type V3UnitSkill} from '@/lib/battle/v3/engine';
import './battle.css';

type Mode='inspect'|'move'|'attack'|'skill'|'power';
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
export function BattleV3Game({narrator=false,onBack}:{
 narrator?:boolean;onBack?:()=>void;
}){
 const [options,setOptions]=useState<V3ScenarioOptions>(defaults);
 const [game,setGame]=useState<V3Game|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [mode,setMode]=useState<Mode>('inspect');
 const [skill,setSkill]=useState<V3UnitSkill|null>(null);
 const [status,setStatus]=useState('');
 const [showManual,setShowManual]=useState(false);
 const [showDetails,setShowDetails]=useState(false);
 const update=(patch:Partial<V3ScenarioOptions>)=>setOptions(x=>({...x,...patch}));
 const begin=()=>{
  try{
   const created=createV3Game(options);
   setGame(created);setSelected(created.battle.activeUnitId);setMode('inspect');
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
  if(canAct&&(mode==='power'||mode==='skill')){
   if(target)cast(target.id);else setStatus('Selecione uma tropa para aplicar a habilidade.');return;
  }
  if(target){setSelected(target.id);setMode('inspect');}
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
   <h1>Batalhar</h1>
   <p>Escolha exércitos-modelo, generais e um terreno para jogar uma batalha por agrupamentos.</p>
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
      <label>Casa modelo<select aria-label={'Casa modelo '+s.label} value={options[key]}
       onChange={e=>update({[key]:e.target.value})}>
       {MODEL_HOUSES.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
      </select></label>
      <h3>{chosen.subtitle}</h3><p>{chosen.description}</p>
      <div className="crusade-model-roster">
       {chosen.units.map(u=><span key={u.name}>{u.name} <b>×{u.count}</b></span>)}
      </div>
      <label>Comandante<select aria-label={'Comandante '+s.label} value={leader.id}
       onChange={e=>update({[ckey]:e.target.value as CommanderId})}>
       {V3_COMMANDERS.map(c=><option key={c.id} value={c.id}>{c.name} · {c.style}</option>)}
      </select></label>
      <div className="crusade-commander-card"><strong>{leader.name}</strong>
       <small>{leader.title} · {leader.style}</small>
       <p>{leader.lore}</p><p><b>{leader.powerName}:</b> {leader.powerDescription}</p>
      </div>
     </article>;
    })}
   </div>
   <div className="battle-form-row">
    <label>Cenário<select value={options.scenario} aria-label="Cenário da Cruzada"
     onChange={e=>update({scenario:e.target.value as BattleScenarioId})}>
      {Object.entries(SCENARIOS).map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Controle adversário<select value={options.opponent} aria-label="Controle do adversário"
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
  <div className="crusade-combat-grid">
   <aside className="battle-surface crusade-left" aria-label="Ordem de batalha">
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
    <BattleBoard map={battle!.map} stacks={battle!.stacks} activeId={battle!.activeUnitId}
     selectedId={selected} moveKeys={mode==='move'&&canAct?moves.map(c=>hexKey(c.to)):[]}
     attackKeys={mode==='attack'&&canAct?attacks.map(c=>c.targetId):
      (mode==='power'&&canAct?powerTargets.map(s=>s.id):mode==='skill'&&canAct?
       battle!.stacks.filter(s=>s.side!==active?.side&&s.currentHp>0).map(s=>s.id):[])}
     onHexClick={clickHex}/>
    <p className="battle-note">
     {mode==='move'?'Clique no destino verde para mover.':
      mode==='attack'?'Clique no alvo vermelho para atacar.':
      mode==='power'?'Clique na tropa apropriada para o poder do comandante.':
      mode==='skill'?'Clique no inimigo para executar a habilidade.':
      'Escolha uma ação; as pilhas são movidas por hexágonos e agem por iniciativa.'}
    </p>
    {status&&<p role="status" className="crusade-status">{status}</p>}
    {battle?.phase==='completed'&&report&&<div className="crusade-end">
     <h2>{battle.winner===null?'Empate':battle.winner==='attacker'?'Vitória aliada':'Vitória adversária'}</h2>
     <p>Baixas: aliados {report.bySide.attacker.casualties} · adversários {report.bySide.defender.casualties}</p>
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
    <div className="crusade-action-buttons">
     <Button disabled={!canAct||!moves.length} variant={mode==='move'?'default':'outline'}
      onClick={()=>{setMode('move');setSkill(null);}}>Mover</Button>
     <Button disabled={!canAct||!attacks.length} variant={mode==='attack'?'default':'outline'}
      onClick={()=>{setMode('attack');setSkill(null);}}>Atacar</Button>
     <Button disabled={!canAct||!active||!legal.some(c=>c.type==='DEFEND')} variant="outline"
      onClick={()=>active&&action({type:'DEFEND',unitId:active.id})}>Defender</Button>
     <Button disabled={!canAct||!active||!legal.some(c=>c.type==='WAIT')} variant="outline"
      onClick={()=>active&&action({type:'WAIT',unitId:active.id})}>Esperar</Button>
     <Button disabled={!canAct||!active} variant="outline"
      onClick={()=>active&&action({type:'END_ACTIVATION',unitId:active.id})}>Fim de turno</Button>
    </div>
    <h3>Habilidades de tropa</h3>
    {availableSkills.length===0?<p className="battle-note">Sem habilidade disponível nesta ativação.</p>:
      <div className="crusade-ability-buttons">{availableSkills.map(s=>
       <Button size="sm" variant={mode==='skill'&&skill===s?'default':'outline'}
        key={s} disabled={!canAct} onClick={()=>{
         if(!game)return;
         if(s==='SHIELD_WALL'){try{finish(v3UseUnitSkill(game,s));setStatus('Formação defensiva aplicada.');}
          catch(e){setStatus(e instanceof Error?e.message:'Ordem inválida.');}}
         else{setSkill(s);setMode('skill');}
        }}>{v3SkillName(s)}</Button>)}</div>}
    <h3>Comandante</h3>
    {currentCommander&&<div className="crusade-commander-card">
     <strong>{currentCommander.name}</strong><p>{currentCommander.powerDescription}</p>
     <Button size="sm" disabled={!canPower}
      variant={mode==='power'?'default':'outline'}
      onClick={()=>{setMode('power');setSkill(null);}}>
      {game.usedPowers[active?.side??'attacker']?'Poder já utilizado':currentCommander.powerName}
     </Button>
    </div>}
    <Button size="sm" variant="outline" onClick={()=>setShowDetails(x=>!x)}>
     {showDetails?'Ocultar histórico':'Ver histórico'}
    </Button>
    <Button size="sm" variant="outline" onClick={()=>downloadBattleJson('crusada-v3-treino.json',
      JSON.stringify(game,null,2))}>Exportar treino JSON</Button>
    <Button size="sm" variant="outline" onClick={()=>{setGame(null);setStatus('');}}>Sair da batalha</Button>
    {onBack&&<Button size="sm" variant="outline" onClick={onBack}>Voltar ao painel</Button>}
   </aside>
  </div>
  {showDetails&&<section className="battle-surface crusade-history" aria-label="Histórico tático V3">
   <h3>Registro de ordens</h3>
   <ol>{[...game.log].reverse().map((e,i)=><li key={i}>
     Rodada {e.round} · {e.side==='attacker'?'Aliados':'Adversários'} · {e.label}
    </li>)}</ol>
  </section>}
 </main>;
}
