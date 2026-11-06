import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import type {BattleCommand,Hex} from '@/lib/battle/domain/types';
import {livingCount} from '@/lib/battle/domain/morale';
import {commander} from '@/lib/battle/v3/commanders';
import {v3LegalSkills,v3SkillName,v3CanUseCommander,type V3UnitSkill} from '@/lib/battle/v3/engine';
import {listV34Sessions,joinV34Session,readV34Session,playV34Step,
 type V34SessionListItem,type V34SessionView} from '@/lib/battle/v3/synced.functions';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import type {V34Action} from '@/lib/battle/v3/synced';
import {BattleBoard} from './BattleBoard';
import {BattleV36Initiative,BattleV36CommanderPanel} from './BattleV36Hud';

export function BattleV34PlayerButton({houseId,onOpen}:{
 houseId:string;onOpen:()=>void;
}){
 const list=useServerFn(listV34Sessions);
 const {data=[]}=useQuery({queryKey:['v34-sessions-button',houseId],queryFn:()=>list(),
  refetchInterval:12000,retry:false});
 const visible=data.some(x=>x.attacker_house_id===houseId||x.defender_house_id===houseId);
 return visible?<Button variant="outline" onClick={onOpen}>Duelo sincronizado</Button>:null;
}
export function BattleV34PlayerLobby({houseId,onBack}:{
 houseId:string;onBack:()=>void;
}){
 const list=useServerFn(listV34Sessions),join=useServerFn(joinV34Session);
 const [roomId,setRoomId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const {data=[],refetch,isPending}=useQuery({queryKey:['v34-lobby',houseId],
  queryFn:()=>list(),refetchInterval:5000,retry:false});
 const sessions=data.filter(i=>i.attacker_house_id===houseId||i.defender_house_id===houseId);
 const enter=async(s:V34SessionListItem)=>{
  const side=s.attacker_house_id===houseId?'attacker':'defender';
  const taken=side==='attacker'?s.attacker_user_id:s.defender_user_id;
  if(taken){setRoomId(s.id);return;}
  setBusy(true);
  try{await join({data:{sessionId:s.id,side}});await refetch();setRoomId(s.id);}
  catch(e){setMessage(e instanceof Error?e.message:'Não foi possível entrar.');}
  finally{setBusy(false);}
 };
 if(roomId)return <BattleV34Room sessionId={roomId} onBack={()=>{
  setRoomId(null);void refetch();
 }}/>;
 return <section className="battle-module crusade-mode" aria-label="Duelo sincronizado">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · CRUZADA V3.4</p><h1>Duelo sincronizado</h1>
   <p>Duas contas autorizadas, turnos persistidos e replay verificável.
    Tudo continua sendo treinamento fictício.</p>
  </header>
  <div className="battle-surface">
   {isPending&&<p>Consultando partidas da casa…</p>}
   {!isPending&&sessions.length===0&&<p>O Narrador ainda não criou uma partida remota para esta casa.</p>}
   {sessions.map(s=>{
    const side=s.attacker_house_id===houseId?'attacker':'defender';
    const occupied=side==='attacker'?s.attacker_user_id:s.defender_user_id;
    return <article className="battle-result-card" key={s.id}>
     <strong>{s.title}</strong>
     <p>{side==='attacker'?'Comando atacante':'Comando defensor'} ·
      {s.status==='waiting'?' Aguardando participantes':s.status==='active'?' Em andamento':
       s.status==='completed'?' Concluída':' Encerrada'}</p>
     <Button disabled={busy||s.status==='closed'} size="sm"
      onClick={()=>void enter(s)}>{occupied?'Visualizar partida':'Assumir este comando'}</Button>
    </article>;
   })}
   {message&&<p role="alert">{message}</p>}
   <div className="battle-home-actions"><Button variant="outline" onClick={onBack}>Voltar</Button>
    <Button variant="outline" onClick={()=>void refetch()}>Atualizar</Button></div>
  </div>
 </section>;
}
function BattleV34Room({sessionId,onBack}:{sessionId:string;onBack:()=>void}){
 const read=useServerFn(readV34Session),apply=useServerFn(playV34Step);
 const [mode,setMode]=useState<'inspect'|'move'|'attack'|'skill'|'power'>('inspect');
 const [skill,setSkill]=useState<V3UnitSkill|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const {data,refetch,isPending,isError}=useQuery({
  queryKey:['v34-room',sessionId],queryFn:async()=>{
   const value=await read({data:{sessionId}});
   return JSON.parse(value.snapshotJson) as V34SessionView;
  },
  refetchInterval:2500,refetchOnWindowFocus:'always',retry:false,
 });
 const game=data?.game,battle=game?.battle;
 const active=battle?.stacks.find(s=>s.id===battle.activeUnitId);
 const side=data?.mySide??null;
 const canAct=Boolean(side&&active?.side===side&&data?.session.status==='active'&&
  data?.invitationOpen&&!busy);
 const legal=useMemo(()=>battle?.phase==='active'?getLegalActions(battle):[],[battle]);
 const moves=legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
 const attacks=legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK');
 const inspected=battle?.stacks.find(s=>s.id===selected)??active;
 const commanderNow=game&&active?commander(game.commanders[active.side]):null;
 const skills=game?v3LegalSkills(game):[];
 const targets=battle?.stacks.filter(s=>active&&s.currentHp>0&&
  (mode==='power'&&commanderNow?
   (commanderNow.powerTarget==='ally'?s.side===active.side:s.side!==active.side):
    s.side!==active.side))??[];
 const send=async(action:V34Action)=>{
  if(!data||!canAct)return;
  setBusy(true);setMessage('');
  try{
   await apply({data:{
    sessionId,commandId:crypto.randomUUID(),expectedVersion:data.version,
    expectedHash:data.hash,action,
   }});
   setMode('inspect');setSkill(null);setSelected(null);
   await refetch();
  }catch(e){
   setMessage(e instanceof Error?e.message:'Turno rejeitado; recarregue.');
   await refetch();
  }finally{setBusy(false);}
 };
 const chooseHex=(hex:Hex)=>{
  const stack=battle?.stacks.find(s=>s.currentHp>0&&hexKey(s.position)===hexKey(hex));
  if(canAct&&active&&mode==='move'){
   const move=moves.find(m=>hexKey(m.to)===hexKey(hex));
   if(move)void send({kind:'order',command:move});
   else setMessage('Destino não é alcançável.');return;
  }
  if(canAct&&active&&mode==='attack'&&stack){
   const attack=attacks.find(a=>a.targetId===stack.id);
   if(attack)void send({kind:'order',command:attack});
   else setMessage('Alvo não pode ser atacado.');return;
  }
  if(canAct&&stack&&mode==='power'){void send({kind:'power',targetId:stack.id});return;}
  if(canAct&&stack&&mode==='skill'&&skill){
   void send({kind:'skill',skill,targetId:stack.id});return;
  }
  if(stack)setSelected(stack.id);
 };
 if(isPending&&!data)return <section className="battle-surface">Sincronizando batalha…</section>;
 if(isError||!data||!battle)return <section className="battle-surface">
  <p role="alert">Sessão indisponível, revogada ou sem migração de banco.</p>
  <Button variant="outline" onClick={onBack}>Voltar</Button>
 </section>;
 return <main className="battle-module crusade-mode" aria-label="Arena multiplayer V3.4">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CRUZADA · PARTIDA SINCRONIZADA</p>
   <h1>{data.session.title}</h1>
   <p>Rodada {battle.round} · Comandos {data.version} ·
    {data.session.status==='waiting'?' Aguardando o segundo jogador':
     battle.phase==='completed'?' Batalha encerrada':
      ' Vez de '+(active?.side==='attacker'?'Atacante':'Defensor')}</p>
   <p><strong>Sem efeitos sobre as casas oficiais.</strong></p>
  </header>
  <BattleV36Initiative game={game} onInspect={id=>setSelected(id)}/>
  <section className="battle-surface">
   <p>Seu papel: <strong>{side==='attacker'?'Atacante':
    side==='defender'?'Defensor':'Observador'}</strong> ·
    Estado: <strong>{data.session.status}</strong></p>
   {!data.invitationOpen&&<p role="alert">Convocação encerrada: novas ordens bloqueadas.</p>}
   <div className="crusade-v34-status"><span>Versão CAS: {data.version}</span>
    <code title="SHA-256 do estado">{data.hash.slice(0,18)}…</code>
    <Button variant="outline" size="sm" onClick={()=>void refetch()}>Sincronizar</Button></div>
   <div className="crusade-combat-grid">
    <aside className="crusade-left">
     <BattleV36CommanderPanel game={game} side={active?.side??'attacker'}
      active={active??null}
      canPower={canAct&&v3CanUseCommander(game)}
      onPower={()=>setMode('power')}/>
     <h3>Exércitos</h3>
     {battle.stacks.map(stack=><button key={stack.id} type="button"
      className={'crusade-troop'+(inspected?.id===stack.id?' selected':'')}
      onClick={()=>setSelected(stack.id)}>
      <strong>{stack.name}</strong>
      <span>{stack.side==='attacker'?'Atacante':'Defensor'} ·
       {livingCount(stack)}/{stack.initialCount}</span>
      <span className="crusade-life-track"><span
       style={{width:Math.floor(100*stack.currentHp/(stack.hpPerSoldier*stack.initialCount))+'%'}}/></span>
     </button>)}
    </aside>
    <div className="crusade-map">
     <BattleBoard appearance="illustrated" map={battle.map} stacks={battle.stacks} activeId={battle.activeUnitId}
      selectedId={inspected?.id??null}
      moveKeys={canAct&&mode==='move'?moves.map(m=>hexKey(m.to)):[]}
      attackKeys={canAct&&mode==='attack'?attacks.map(m=>m.targetId):
       canAct&&(mode==='power'||mode==='skill')?targets.map(x=>x.id):[]}
      onHexClick={chooseHex}/>
     {message&&<p role="status" className="crusade-status">{message}</p>}
    </div>
    <aside className="crusade-right">
     <h3>Ordens</h3>
     <p>{inspected?.name??'Selecione um destacamento'}</p>
     <div className="crusade-action-buttons">
      <Button disabled={!canAct||!moves.length} variant="outline"
       onClick={()=>setMode('move')}>Mover</Button>
      <Button disabled={!canAct||!attacks.length} variant="outline"
       onClick={()=>setMode('attack')}>Atacar</Button>
      <Button disabled={!canAct||!active||!legal.some(a=>a.type==='DEFEND')} variant="outline"
       onClick={()=>active&&void send({kind:'order',command:{type:'DEFEND',unitId:active.id}})}>Defender</Button>
      <Button disabled={!canAct||!active||!legal.some(a=>a.type==='WAIT')} variant="outline"
       onClick={()=>active&&void send({kind:'order',command:{type:'WAIT',unitId:active.id}})}>Esperar</Button>
      <Button disabled={!canAct||!active} variant="outline" onClick={()=>
       active&&void send({kind:'order',command:{type:'END_ACTIVATION',unitId:active.id}})}>Fim de turno</Button>
     </div>
     {skills.map(s=><Button key={s} disabled={!canAct} variant="outline" size="sm"
      onClick={()=>{
       if(s==='SHIELD_WALL')void send({kind:'skill',skill:s});
       else {setMode('skill');setSkill(s);}
      }}>{v3SkillName(s)}</Button>)}
     {commanderNow&&<Button size="sm" variant="outline" disabled={!canAct||!game||!v3CanUseCommander(game)}
      onClick={()=>setMode('power')}>{commanderNow.powerName}</Button>}
     <Button size="sm" variant="outline" onClick={()=>downloadBattleJson(
      'crusada-v34-replay.json',JSON.stringify({
       format:'CCA-V34-REPLAY-1',rulesVersion:'CCA-V34-SYNC-1',
       initial:data.initialGame,initialHash:data.receipts[0]?.prevHash??data.hash,
       receipts:data.receipts,finalHash:data.hash,
      },null,2))}>Exportar replay verificado</Button>
     <Button size="sm" variant="outline" onClick={onBack}>Sair da arena</Button>
    </aside>
   </div>
   {battle.phase==='completed'&&<p role="status"><strong>
    {battle.winner===null?'Empate':battle.winner==='attacker'?'Vitória atacante':'Vitória defensora'}
   </strong></p>}
  </section>
 </main>;
}
