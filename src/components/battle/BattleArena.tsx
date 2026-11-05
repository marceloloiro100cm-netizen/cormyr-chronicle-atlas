import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleCommand,BattleStack,BattleState,Hex,Side} from '@/lib/battle/domain/types';
import {startBattle,applyBattleCommand,getLegalActions,legalAttack} from '@/lib/battle/domain/turns';
import {livingCount,casualtyCount} from '@/lib/battle/domain/morale';
import {resolveDamage} from '@/lib/battle/domain/combat';
import {battleReport} from '@/lib/battle/domain/report';
import {hexKey,hexDistance} from '@/lib/battle/geometry/hex';
import {reachablePaths} from '@/lib/battle/geometry/pathfinding';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {BattleBoard} from './BattleBoard';
import {runAiUntilHuman} from '@/lib/battle/domain/ai';
import {exportReplayJson} from '@/lib/battle/domain/replay';
import {BattleReplay} from './BattleReplay';
import {BATTLE_PERSISTENCE_UI_ENABLED} from '@/lib/battle/feature-flag';
import {saveBattleReplay} from '@/lib/battle/battle-session.functions';
import {useServerFn} from '@tanstack/react-start';

const LABEL:Record<Side,string>={attacker:'Atacante',defender:'Defensor'};
function BattleResult({state,initial,sideNames,onRestart,onExit}:{
 initial:BattleState;
 state:BattleState;sideNames:Record<Side,string>;onRestart:()=>void;onExit:()=>void;
}){
 const report=battleReport(state);
 const [replayVisible,setReplayVisible]=useState(false);
 const save=useServerFn(saveBattleReplay);
 const [savedMessage,setSavedMessage]=useState(''),[saving,setSaving]=useState(false);
 const persist=async()=>{
  setSaving(true);
  try{const receipt=await save({data:{replayJson:exportReplayJson(initial,state)}});
   setSavedMessage('Batalha salva: '+receipt.sessionId);
  }catch(e){setSavedMessage(e instanceof Error?e.message:'Falha ao salvar.');}
  finally{setSaving(false);}
 };
 return <section className="battle-surface" aria-label="Resultado da batalha">
   <h2>Resultado da simulação</h2>
   <p><strong>{state.winner?sideNames[state.winner]+' venceu':'Empate'}</strong>
     {' · '}Causa: {state.resultReason??'não informada'}{' · '}Rodadas: {state.round}</p>
   <div className="battle-summary-grid">
    {(['attacker','defender'] as const).map(side=><article key={side} className="battle-result-card">
      <h3>{sideNames[side]}</h3>
      <p>{report.bySide[side].alive} / {report.bySide[side].initial} sobreviventes</p>
      <p>{report.bySide[side].casualties} baixas táticas · {report.bySide[side].damageDealt} dano causado</p>
    </article>)}
   </div>
   <div className="battle-report-scroll"><table className="battle-report-table">
    <caption>Resultado por agrupamento — sem alterações nas fichas oficiais</caption>
    <thead><tr><th>Unidade</th><th>Lado</th><th>Vivos</th><th>Baixas</th><th>PV</th><th>Causou</th><th>Recebeu</th><th>Moral</th></tr></thead>
    <tbody>{report.units.map(unit=><tr key={unit.id}>
      <td>{unit.name}</td><td>{LABEL[unit.side]}</td><td>{unit.alive} / {unit.initial}</td>
      <td>{unit.casualties}</td><td>{unit.remainingHp} / {unit.initialHp}</td>
      <td>{unit.damageDealt}</td><td>{unit.damageReceived}</td><td>{unit.routed?'Debandada':'—'}</td>
    </tr>)}</tbody>
   </table></div>
   <div className="battle-form-row">
    <Button variant="outline" onClick={()=>downloadBattleJson('resultado-batalha.json',JSON.stringify(report,null,2))}>Exportar resultado JSON</Button>
    {BATTLE_PERSISTENCE_UI_ENABLED&&<Button disabled={saving} variant="outline" onClick={()=>void persist()}>
      Salvar batalha (nova cópia)
    </Button>}
    <Button variant="outline" onClick={()=>{try{downloadBattleJson('batalha-replay-verificado.json',exportReplayJson(initial,state));}
      catch(e){window.alert(e instanceof Error?e.message:'Replay inválido.');}}}>Exportar batalha completa JSON</Button>
    <Button variant="outline" onClick={()=>setReplayVisible(v=>!v)}>{replayVisible?'Ocultar replay':'Rever turnos'}</Button>
    <Button variant="outline" onClick={onRestart}>Nova simulação com as mesmas forças</Button>
    <Button onClick={onExit}>Voltar ao painel</Button>
   </div>
   {savedMessage&&<p role="status">{savedMessage}</p>}
   {replayVisible&&<BattleReplay initial={initial} state={state}/>}
   <p className="battle-note">Replay verificável PTE-2.0. Cada salvamento cria uma nova cópia tática; as fichas militares oficiais não são alteradas.</p>
 </section>;
}
export function BattleArena({initial,sideNames,onExit}:{
 initial:BattleState;sideNames:Record<Side,string>;onExit:()=>void;
}){
 const [battle,setBattle]=useState<BattleState>(()=>startBattle(initial));
 const [history,setHistory]=useState<BattleState[]>([]);
 const [selected,setSelected]=useState<string|null>(battle.activeUnitId);
 const [mode,setMode]=useState<'inspect'|'move'|'attack'>('inspect');
 const [pendingMove,setPendingMove]=useState<Hex|null>(null),[pendingAttack,setPendingAttack]=useState<string|null>(null);
 const [hover,setHover]=useState<Hex|null>(null);
 const [notice,setNotice]=useState(''),[paused,setPaused]=useState(false);
 const saveProgress=useServerFn(saveBattleReplay);
 const [savingProgress,setSavingProgress]=useState(false);
 const [showManual,setShowManual]=useState(false),[reason,setReason]=useState('');
 const [manualWinner,setManualWinner]=useState<Side|null>(null),[showHelp,setShowHelp]=useState(false);
 const active=battle.stacks.find(s=>s.id===battle.activeUnitId);
 const inspected=battle.stacks.find(s=>s.id===selected)??active;
 const canAct=battle.phase==='active'&&!paused&&selected===battle.activeUnitId&&Boolean(active&&battle.controls[active.side]==='human');
 const legal=useMemo(()=>battle.phase==='active'?getLegalActions(battle):[],[battle]);
 const moves=useMemo(()=>legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE'),[legal]);
 const attacks=useMemo(()=>legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK'),[legal]);
 const attackIds=attacks.map(c=>c.targetId);
 const moveKeys=moves.map(c=>hexKey(c.to));
 const paths=useMemo(()=>{
  if(!active||active.movedThisActivation||active.attackedThisActivation||battle.phase!=='active')return [];
  const occupied=battle.stacks.filter(s=>s.id!==active.id&&s.currentHp>0).map(s=>s.position);
  const enemies=battle.stacks.filter(s=>s.side!==active.side&&s.currentHp>0&&s.moraleState!=='routed').map(s=>s.position);
  return reachablePaths(battle.map,active.position,active.movementHex,{occupied,enemies});
 },[battle,active]);
 const candidate=mode==='move'?(pendingMove??hover):null;
 const selectedPath=candidate?paths.find(p=>hexKey(p.to)===hexKey(candidate)):undefined;
 const target=pendingAttack?battle.stacks.find(s=>s.id===pendingAttack):undefined;
 const damagePreview=active&&target&&legalAttack(battle,active,target).legal
   ?resolveDamage(battle.map,active,target,hexDistance(active.position,target.position)>1):null;
 const clear=()=>{setMode('inspect');setPendingMove(null);setPendingAttack(null);setHover(null);};
 useEffect(()=>{
  if(paused||battle.phase!=='active'||!battle.activeUnitId)return;
  const unit=battle.stacks.find(s=>s.id===battle.activeUnitId);
  if(!unit||battle.controls[unit.side]!=='ai')return;
  try{
   const outcome=runAiUntilHuman(battle);
   if(outcome.commands.length){
    setHistory(values=>[...values.slice(-99),battle]);
    setBattle(outcome.state);setSelected(outcome.state.activeUnitId);
    setMode('inspect');setPendingMove(null);setPendingAttack(null);
    setNotice('IA executou '+outcome.commands.length+' comandos legais.');
   }
  }catch(e){setPaused(true);setNotice(e instanceof Error?e.message:'Falha na IA: simulação pausada.');}
 },[battle,paused]);
 const command=(cmd:BattleCommand)=>{
  if(paused){setNotice('A simulação está pausada.');return;}
  try{
   const next=applyBattleCommand(battle,cmd);
   setHistory(states=>[...states.slice(-99),battle]);
   setBattle(next);setSelected(next.activeUnitId);clear();setNotice('');
  }catch(e){setNotice(e instanceof Error?e.message:'Comando recusado.');}
 };
 const chooseHex=(hex:Hex)=>{
  if(paused)return;
  const unit=battle.stacks.find(s=>hexKey(s.position)===hexKey(hex)&&s.currentHp>0);
  if(canAct&&mode==='move'){
   if(moveKeys.includes(hexKey(hex))){setPendingMove(hex);setPendingAttack(null);setNotice('Confirme o deslocamento abaixo.');}
   else setNotice('O destino não está ao alcance ou está bloqueado.');
   return;
  }
  if(canAct&&mode==='attack'){
   if(unit&&attackIds.includes(unit.id)){setPendingAttack(unit.id);setPendingMove(null);setNotice('Confirme o ataque abaixo.');}
   else setNotice('Este hexágono não contém um alvo legal.');
   return;
  }
  if(unit){setSelected(unit.id);clear();}
 };
 const undo=()=>{
  const last=history.at(-1);if(!last)return;
  setHistory(xs=>xs.slice(0,-1));setBattle(last);setSelected(last.activeUnitId);setNotice('Última ação desfeita no laboratório.');clear();
 };
 const restart=()=>{
  if(!window.confirm('Reiniciar esta simulação e descartar as ações anteriores?'))return;
  const fresh=startBattle(initial);setBattle(fresh);setHistory([]);setSelected(fresh.activeUnitId);clear();setNotice('');
 };
 if(battle.phase==='completed'||battle.phase==='archived')
  return <BattleResult state={battle} initial={initial} sideNames={sideNames} onRestart={restart} onExit={onExit}/>;
 return <section className="battle-arena" aria-label="Arena tática">
  <div className="battle-arena-top battle-surface">
   <div><h2>{battle.name}</h2><p>Rodada {battle.round} / 20 · {active?active.name:'Sem unidade ativa'}
     {' · '}PTE-2.0 experimental</p></div>
   <div className="battle-form-row">
    <Button size="sm" variant="outline" onClick={()=>setPaused(x=>!x)}>{paused?'Retomar':'Pausar'}</Button>
    <Button size="sm" variant="outline" disabled={!history.length} onClick={undo}>Desfazer ação</Button>
    <Button size="sm" variant="outline" onClick={restart}>Reiniciar</Button>
    {BATTLE_PERSISTENCE_UI_ENABLED&&<Button size="sm" variant="outline" disabled={savingProgress}
      onClick={async()=>{
        setSavingProgress(true);
        try{const saved=await saveProgress({data:{replayJson:exportReplayJson(initial,battle)}});
          setNotice('Cópia tática salva: '+saved.sessionId);
        }catch(e){setNotice(e instanceof Error?e.message:'Falha no salvamento.');}
        finally{setSavingProgress(false);}
      }}>Salvar progresso</Button>}
    <Button size="sm" variant="outline" onClick={()=>setShowHelp(x=>!x)}>Regras</Button>
    <Button size="sm" variant="outline" onClick={onExit}>Sair</Button>
   </div>
  </div>
  {showHelp&&<div className="battle-surface" role="note">Mover uma vez e atacar depois; defender concede +2 até a próxima ativação; esperar uma vez por rodada. Retaliação corpo a corpo uma vez por rodada. Todas as baixas são apenas simuladas.</div>}
  <div className="battle-arena-grid">
    <aside className="battle-surface battle-army-sidebar" aria-label="Exércitos na arena">
     {(['attacker','defender'] as const).map(side=><div key={side}>
      <h3>{sideNames[side]}</h3>
      {battle.stacks.filter(u=>u.side===side).map(u=><button type="button" key={u.id}
        className={u.id===selected?'battle-unit-list active':'battle-unit-list'}
        aria-pressed={u.id===selected} onClick={()=>{setSelected(u.id);clear();}}>
        <span>{u.id===battle.activeUnitId?'● ':''}{u.name}</span>
        <span>{livingCount(u)}/{u.initialCount}{u.moraleState==='routed'?' · Debandada':''}</span>
      </button>)}
     </div>)}
    </aside>
    <div className="battle-surface battle-field">
     <BattleBoard map={battle.map} stacks={battle.stacks} activeId={battle.activeUnitId}
       selectedId={selected} moveKeys={canAct&&mode==='move'?moveKeys:[]}
       attackKeys={canAct&&mode==='attack'?attackIds:[]} pendingHex={pendingMove}
       onHexClick={chooseHex} onHoverHex={setHover}/>
     {mode==='move'&&<p role="status">Rota: {selectedPath?selectedPath.steps+' hexágonos · custo '+selectedPath.cost:'selecione um hexágono destacado'}</p>}
     {damagePreview&&<p role="status">Ataque previsto contra {target?.name}: {damagePreview.damage} PV · {damagePreview.casualties} baixas antes de eventual retaliação.</p>}
     {notice&&<p role="alert" className="battle-error">{notice}</p>}
     <div className="battle-actions" aria-label="Ações da unidade">
      <Button disabled={!canAct||!moves.length} variant={mode==='move'?'default':'outline'} onClick={()=>{clear();setMode('move');}}>Mover</Button>
      <Button disabled={!canAct||!attacks.length} variant={mode==='attack'?'default':'outline'} onClick={()=>{clear();setMode('attack');}}>Atacar</Button>
      <Button disabled={!canAct||!legal.some(c=>c.type==='DEFEND')} variant="outline"
        onClick={()=>active&&command({type:'DEFEND',unitId:active.id})}>Defender</Button>
      <Button disabled={!canAct||!legal.some(c=>c.type==='WAIT')} variant="outline"
        onClick={()=>active&&command({type:'WAIT',unitId:active.id})}>Esperar</Button>
      <Button disabled={!canAct} variant="outline"
        onClick={()=>active&&command({type:'END_ACTIVATION',unitId:active.id})}>Encerrar ativação</Button>
     </div>
     {pendingMove&&active&&<div className="battle-confirm" role="group" aria-label="Confirmar movimento">
       <span>Movimento para {pendingMove.q}, {pendingMove.r}</span>
       <Button onClick={()=>command({type:'MOVE',unitId:active.id,to:pendingMove})}>Confirmar movimento</Button>
       <Button variant="outline" onClick={()=>setPendingMove(null)}>Cancelar</Button>
     </div>}
     {pendingAttack&&active&&<div className="battle-confirm" role="group" aria-label="Confirmar ataque">
       <span>Alvo: {target?.name}</span>
       <Button onClick={()=>command({type:'ATTACK',unitId:active.id,targetId:pendingAttack})}>Confirmar ataque</Button>
       <Button variant="outline" onClick={()=>setPendingAttack(null)}>Cancelar</Button>
     </div>}
    </div>
    <aside className="battle-surface battle-inspector" aria-label="Ficha tática selecionada">
     <h3>Unidade selecionada</h3>
     {inspected?<UnitInspector unit={inspected} active={inspected.id===battle.activeUnitId}/>:
      <p>Selecione uma unidade no tabuleiro.</p>}
    </aside>
  </div>
  <div className="battle-surface battle-timeline" aria-label="Registro da batalha">
   <h3>Registro de combate</h3>
   {battle.events.length===0?<p>Nenhuma ação registrada.</p>:
    <ol aria-live="polite">{[...battle.events].reverse().slice(0,30).map(e=><li key={e.seq}>
      Rodada {e.round} · {e.type==='DAMAGE'?'Ataque':e.type==='RETALIATION'?'Retaliação':e.type==='MOVE'?'Movimento':e.type==='DEFEND'?'Defesa':e.type==='WAIT'?'Espera':e.type==='END_ACTIVATION'?'Fim de turno':e.type}
      {' · '}{typeof e.delta['damage']==='number'?e.delta['damage']+' PV, '+e.delta['casualties']+' baixas':''}
     </li>)}</ol>}
   <div className="battle-form-row"><Button variant="outline" onClick={()=>setShowManual(x=>!x)}>Encerrar batalha manualmente</Button></div>
   {showManual&&<div className="battle-manual-finish">
     <label>Motivo narrativo (mínimo 10 caracteres)<input aria-label="Motivo do encerramento" maxLength={500} value={reason}
       onChange={e=>setReason(e.target.value)}/></label>
     <label>Resultado<select aria-label="Vencedor manual" value={manualWinner??'draw'}
       onChange={e=>setManualWinner(e.target.value==='draw'?null:e.target.value as Side)}>
       <option value="draw">Empate</option><option value="attacker">{sideNames.attacker}</option>
       <option value="defender">{sideNames.defender}</option></select></label>
     <Button disabled={reason.trim().length<10||paused}
       onClick={()=>command({type:'MANUAL_FINISH',reason,winnerSide:manualWinner})}>Confirmar encerramento</Button>
   </div>}
  </div>
 </section>;
}
function UnitInspector({unit,active}:{unit:BattleStack;active:boolean}){
 return <div>
  <p><strong>{unit.name}</strong>{active?' · Unidade ativa':' · Consulta'}</p>
  <p>{unit.primaryTypeId} · {unit.training} · origem fictícia</p>
  <dl className="battle-inspector-list">
   <dt>Combatentes vivos</dt><dd>{livingCount(unit)} / {unit.initialCount}</dd>
   <dt>PV táticos</dt><dd>{unit.currentHp} / {unit.initialCount*unit.hpPerSoldier}</dd>
   <dt>Baixas nesta batalha</dt><dd>{casualtyCount(unit)}</dd>
   <dt>Ataque / Defesa</dt><dd>{unit.attack} / {unit.defense}</dd>
   <dt>Armadura / Dano</dt><dd>{unit.armor} / {unit.damagePerSoldier}</dd>
   <dt>Movimento / Alcance</dt><dd>{unit.movementHex} / {unit.rangeHex} hex</dd>
   <dt>Moral</dt><dd>{unit.moraleState==='steady'?'Firme':unit.moraleState==='shaken'?'Abalada':'Debandada'}</dd>
   <dt>Posição</dt><dd>{unit.position.q}, {unit.position.r}</dd>
  </dl>
  <details><summary>Origem dos atributos</summary>
   <p>Perfil {unit.primaryTypeId} · treinamento {unit.training} · perfil PTE-2.0 experimental.</p>
   <p>PV = efetivo × PV por combatente; ataque e defesa usam o perfil mais bônus de treinamento.</p>
   <p>Sem acréscimo automático de construções, comandantes ou saúde oficial.</p>
  </details>
 </div>;
}
