import {useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import type {BattleCommand,Hex,Side} from '@/lib/battle/domain/types';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import {fieldUnitAtHex} from '@/lib/battle/v3/field';
import {modelHouse,MODEL_HOUSES} from '@/lib/battle/v3/model-houses';
import {V3_COMMANDERS,commander,type CommanderId} from '@/lib/battle/v3/commanders';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {v3LegalSkills,v3SkillName,type V3Game,type V3Step,type V3UnitSkill} from '@/lib/battle/v3/engine';
import {listBattleSourceHouses} from '@/lib/battle/adapters/readonly-source.functions';
import {createLiveV3Match,listLiveV3Matches,readLiveV3Match,playLiveV3Turn} from '@/lib/battle/v3/live.functions';
import {BattleBoard} from './BattleBoard';
import {BattleExpandedView} from './BattleExpandedView';
import './crusade-v4.css';
import './battle-legibility.css';

type Mode='inspect'|'skill'|'power';
export function BattleV3LiveArena({id,onBack}:{id:string;onBack:()=>void}){
 const read=useServerFn(readLiveV3Match);
 const play=useServerFn(playLiveV3Turn);
 const [expanded,setExpanded]=useState(true);
 const [selected,setSelected]=useState<string|null>(null);
 const [mode,setMode]=useState<Mode>('inspect');
 const [skill,setSkill]=useState<V3UnitSkill|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['battle-v3-live',id],queryFn:()=>read({data:{id}}),
  refetchInterval:2500,refetchOnWindowFocus:'always',retry:false,
 });
 const game=useMemo(()=>data?.gameJson?JSON.parse(data.gameJson) as V3Game:undefined,[data?.gameJson]);
 const active=game?.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
 const canPlay=Boolean(data?.canPlay&&!busy&&game?.battle.phase==='active'&&active);
 const legal=useMemo(()=>game?.battle.phase==='active'?getLegalActions(game.battle):[],[game]);
 const moves=legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK');
 const send=async(step:V3Step)=>{
  if(!data||!canPlay)return;
  setBusy(true);setError('');
  try{
   await play({data:{id,expectedVersion:data.version,step}});
   setMode('inspect');setSkill(null);await refetch();
  }catch(e){
   setError(e instanceof Error?e.message:'Comando recusado; recarregue o turno.');
   await refetch();
  }finally{setBusy(false);}
 };
 const clickHex=(hex:Hex)=>{
  if(!game||!canPlay)return;
  const target=fieldUnitAtHex(game.battle.stacks,hex);
  if(mode==='power'){if(target)void send({type:'POWER',targetId:target.id});return;}
  if(mode==='skill'){
   if(target&&skill)void send({type:'SKILL',skill,targetId:target.id});return;
  }
  if(active&&selected===active.id){
   const attack=target&&attacks.find(c=>c.targetId===target.id);
   if(attack){void send({type:'COMMAND',command:attack,actor:'narrator'});return;}
   if(!target){
    const move=moves.find(c=>hexKey(c.to)===hexKey(hex));
    if(move)void send({type:'COMMAND',command:move,actor:'narrator'});
    return;
   }
  }
  if(target)setSelected(target.id);
 };
 useEffect(()=>{
  if(game?.battle.activeUnitId)setSelected(game.battle.activeUnitId);
 },[game?.battle.activeUnitId]);
 if(isPending)return <section className="battle-surface" role="status">Carregando batalha compartilhada…</section>;
 if(isError||!data||!game)return <section className="battle-surface">
  <p role="alert">Partida inacessível ou permissão revogada.</p><Button onClick={onBack}>Voltar</Button>
 </section>;
 const current=active?commander(game.commanders[active.side]):null;
 const inspected=game.battle.stacks.find(s=>s.id===selected&&s.currentHp>0&&s.moraleState!=='routed');
 const skillOptions=canPlay?v3LegalSkills(game):[];
 const army=(side:Side)=>modelHouse(side==='attacker'?game.setup.attackerHouseId:game.setup.defenderHouseId).name;
 const arena=<main className="battle-module crusade-mode crusade-v4" aria-label="Cruzada V3 multiplayer">
  <section className="crusade-v4-stage">
   <header className="crusade-v4-header">
    <div><p className="battle-eyebrow">CORMYR · PARTIDA SINCRONIZADA · SEM BAIXAS OFICIAIS</p>
     <h1>{data.title}</h1>
     <p>Rodada {game.battle.round} · versão {data.version} · {game.battle.phase==='completed'?'Finalizada':canPlay?'Seu turno':'Aguardando oponente'}</p>
     <p>Casas participantes: {data.attackerHouseId} × {data.defenderHouseId}</p>
    </div>
    <div className="crusade-v4-utility">
     <Button variant="outline" onClick={()=>setExpanded(x=>!x)}>
      {expanded?'Sair da tela ampliada':'Ampliar batalha'}</Button>
     <Button variant="outline" onClick={onBack}>Voltar à lista</Button>
     <Button variant="outline" disabled={busy} onClick={()=>void refetch()}>Atualizar turno</Button>
    </div>
   </header>
   <section className="crusade-v4-turns" aria-label="Fila da batalha compartilhada">
    <h2>Ordem de combate</h2>
    <p>{active?active.name+' · '+army(active.side):'Nenhuma unidade ativa'}</p>
   </section>
   <div className="crusade-v4-columns">
    <section className="crusade-v4-general" aria-label="General multiplayer">
     <h2>General</h2><strong>{current?.name??'Batalha encerrada'}</strong>
     <p>{current?.powerDescription}</p>
     {active&&<p>Unidade ativa: {active.name}</p>}
     {canPlay&&current&&!game.usedPowers[active!.side]&&
      <Button variant="outline" onClick={()=>{setMode('power');setSkill(null);}}>
       {current.powerName}</Button>}
     <h3>Habilidades militares</h3>
     {skillOptions.map(ability=><Button key={ability} variant="outline"
      onClick={()=>{
       if(ability==='SHIELD_WALL'){void send({type:'SKILL',skill:ability});return;}
       setMode('skill');setSkill(ability);
      }}>{v3SkillName(ability)}</Button>)}
     {mode!=='inspect'&&<Button variant="outline" onClick={()=>{setMode('inspect');setSkill(null);}}>Cancelar alvo</Button>}
     <h3>Comandos</h3>
     {active&&canPlay&&(['DEFEND','WAIT','END_ACTIVATION'] as const).map(type=>
      <Button key={type} variant="outline" disabled={!legal.some(c=>c.type===type)}
       onClick={()=>void send({type:'COMMAND',command:{type,unitId:active.id},actor:'narrator'})}>
       {type==='DEFEND'?'Defender':type==='WAIT'?'Esperar':'Fim de turno'}</Button>)}
     {!canPlay&&<p className="battle-note">Você pode acompanhar a batalha. Apenas a casa cujo turno está ativo pode agir.</p>}
    </section>
    <section className="crusade-v4-battlefield" aria-label="Mapa multiplayer">
     <h2>Campo de batalha</h2>
     <BattleBoard map={game.battle.map} stacks={game.battle.stacks} theme="cormyr"
      selectedId={selected} activeId={game.battle.activeUnitId}
      moveKeys={canPlay&&mode==='inspect'&&selected===active?.id?moves.map(c=>hexKey(c.to)):[]}
      attackKeys={canPlay&&mode==='inspect'&&selected===active?.id?attacks.map(c=>c.targetId):[]}
      onHexClick={clickHex}/>
     {inspected&&<p>{inspected.name} · {inspected.currentHp} PV · {inspected.moraleState}</p>}
     {error&&<p role="alert">{error}</p>}
     {game.battle.phase==='completed'&&<p role="status">
      Resultado: {game.battle.winner===null?'Empate':army(game.battle.winner)+' venceu'}.
     </p>}
    </section>
    <aside className="crusade-v4-history" aria-label="Histórico multiplayer">
     <h2>Últimas ações</h2>
     <ol>{game.log.slice(-6).reverse().map((x,i)=><li key={i}>
      Rodada {x.round} · {army(x.side)} · {x.label}</li>)}</ol>
     <p className="battle-note">Replay e comandos são verificados no servidor. Nenhuma ficha oficial é modificada.</p>
    </aside>
   </div>
  </section>
 </main>;
 return <BattleExpandedView expanded={expanded} onClose={()=>setExpanded(false)}>
  {arena}
 </BattleExpandedView>;
}
export function BattleV3LiveCreator({onBack}:{onBack:()=>void}){
 const listHouses=useServerFn(listBattleSourceHouses);
 const listMatches=useServerFn(listLiveV3Matches);
 const create=useServerFn(createLiveV3Match);
 const [houses,setHouses]=useState<{id:string;name:string}[]>([]);
 const [matches,setMatches]=useState<{id:string;title:string;status:string}[]>([]);
 const [attacker,setAttacker]=useState(''),[defender,setDefender]=useState('');
 const [title,setTitle]=useState('Cruzada entre casas');
 const [attackerModel,setAttackerModel]=useState(MODEL_HOUSES[0]!.id);
 const [defenderModel,setDefenderModel]=useState(MODEL_HOUSES[1]!.id);
 const [attackerCommander,setAttackerCommander]=useState<CommanderId>('tillet');
 const [defenderCommander,setDefenderCommander]=useState<CommanderId>('knight');
 const [scenario,setScenario]=useState<BattleScenarioId>('plain-open');
 const [selected,setSelected]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{
  try{
   const [h,m]=await Promise.all([listHouses(),listMatches()]);
   setHouses(h);setMatches(m);
  }catch(e){setError(e instanceof Error?e.message:'Convocações multiplayer não disponíveis.');}
 };
 useEffect(()=>{void refresh();},[]);
 if(selected)return <BattleV3LiveArena id={selected} onBack={()=>{setSelected('');void refresh();}}/>;
 const launch=async()=>{
  setBusy(true);setError('');
  try{
   const match=await create({data:{title,attackerHouseId:attacker,defenderHouseId:defender,
    options:{attackerHouseId:attackerModel,defenderHouseId:defenderModel,
     attackerCommander,defenderCommander,scenario}}});
   setSelected(match.id);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao criar partida.');}
  finally{setBusy(false);}
 };
 return <section className="battle-module crusade-mode" aria-label="Convocar batalha multiplayer">
  <header className="battle-header"><h1>Convocar Cruzada multiplayer</h1>
   <p>Dois jogadores, duas casas, turnos sincronizados. Unidades-modelo sem perdas na campanha.</p></header>
  <div className="battle-surface">
   <label>Nome da batalha<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
   <div className="battle-form-row">
    <label>Casa atacante<select value={attacker} onChange={e=>setAttacker(e.target.value)}>
     <option value="">Selecione</option>{houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>Casa defensora<select value={defender} onChange={e=>setDefender(e.target.value)}>
     <option value="">Selecione</option>{houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>Cenário<select value={scenario} onChange={e=>setScenario(e.target.value as BattleScenarioId)}>
     {Object.entries(SCENARIOS).map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
   </div>
   <div className="crusade-model-grid">
    {(['attacker','defender'] as const).map(side=><div key={side} className="crusade-side-card">
     <h3>{side==='attacker'?'Atacante':'Defensor'}</h3>
     <label>Exército-modelo<select value={side==='attacker'?attackerModel:defenderModel}
      onChange={e=>side==='attacker'?setAttackerModel(e.target.value):setDefenderModel(e.target.value)}>
      {MODEL_HOUSES.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
     <label>General<select value={side==='attacker'?attackerCommander:defenderCommander}
      onChange={e=>side==='attacker'?setAttackerCommander(e.target.value as CommanderId):setDefenderCommander(e.target.value as CommanderId)}>
      {V3_COMMANDERS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </div>)}
   </div>
   <Button disabled={busy||!attacker||!defender||attacker===defender||title.trim().length<5}
    onClick={()=>void launch()}>Criar partida compartilhada</Button>
   <Button variant="outline" onClick={onBack}>Voltar</Button>
   {error&&<p role="alert">{error}</p>}
  </div>
  <div className="battle-surface"><h2>Partidas compartilhadas</h2>
   {matches.map(m=><p key={m.id}>{m.title} · {m.status}{' '}
    <Button variant="outline" size="sm" onClick={()=>setSelected(m.id)}>Acompanhar</Button></p>)}
  </div>
 </section>;
}
