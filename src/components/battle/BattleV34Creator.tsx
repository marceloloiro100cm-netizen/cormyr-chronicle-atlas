import {useEffect,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listV34Sessions,createV34Session,closeV34Session,
 type V34SessionListItem} from '@/lib/battle/v3/synced.functions';
import type {BattleV3Invitation} from '@/lib/battle/v3/invitations.functions';

export function BattleV34Creator({houses,invitations}:{
 houses:readonly {id:string;name:string}[];invitations:readonly BattleV3Invitation[];
}){
 const fetch=useServerFn(listV34Sessions);
 const create=useServerFn(createV34Session),close=useServerFn(closeV34Session);
 const [sessions,setSessions]=useState<V34SessionListItem[]>([]);
 const [opponents,setOpponents]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const refresh=async()=>{
  try{setSessions(await fetch());}
  catch(e){setStatus(e instanceof Error?e.message:'Sessões compartilhadas indisponíveis.');}
 };
 useEffect(()=>{void refresh();},[]);
 const make=async(invitationId:string)=>{
  setBusy(true);setStatus('');
  try{
   const defenderHouseId=opponents[invitationId];
   if(!defenderHouseId)throw new Error('Selecione a casa adversária.');
   await create({data:{invitationId,defenderHouseId}});
   setStatus('Partida remota criada. Cada jogador deverá entrar pela própria casa.');
   await refresh();
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível criar partida.');}
  finally{setBusy(false);}
 };
 const finish=async(sessionId:string)=>{
  if(!window.confirm('Encerrar o treino compartilhado para as duas casas?'))return;
  setBusy(true);
  try{await close({data:{sessionId}});setStatus('Partida remota encerrada.');await refresh();}
  catch(e){setStatus(e instanceof Error?e.message:'Não foi possível encerrar a partida.');}
  finally{setBusy(false);}
 };
 return <section className="battle-surface" aria-label="Sessões remotas V3.4">
  <h2>Cruzada V3.4 · Partidas sincronizadas</h2>
  <p>O convite tradicional continua como treino local. Para convidar duas contas, escolha uma
   convocação ativa e uma segunda casa. Nenhuma baixa ou despesa será lançada.</p>
  {invitations.map(invitation=>{
   const existing=sessions.find(s=>s.attacker_house_id===invitation.target_house_id&&
    s.title===invitation.title&&s.status!=='closed');
   return <div key={invitation.id} className="battle-result-card">
    <strong>{invitation.title}</strong>
    {existing?<p>Partida existente: {existing.status}, versão {existing.state_version}</p>:<>
     <label>Casa adversária para duelo
      <select aria-label={'Casa adversária '+invitation.title}
       value={opponents[invitation.id]??''} onChange={e=>
        setOpponents(prev=>({...prev,[invitation.id]:e.target.value}))}>
       <option value="">Selecionar casa</option>
       {houses.filter(h=>h.id!==invitation.target_house_id).map(h=>
        <option value={h.id} key={h.id}>{h.name}</option>)}
      </select>
     </label>
     <Button disabled={busy||!opponents[invitation.id]} size="sm"
      onClick={()=>void make(invitation.id)}>Criar duelo sincronizado</Button>
    </>}
   </div>;
  })}
  <h3>Partidas remotas</h3>
  {sessions.length===0&&<p>Sem sessões V3.4 criadas.</p>}
  {sessions.map(session=><div className="battle-result-card" key={session.id}>
   <strong>{session.title}</strong>
   <p>Atacante: {houses.find(h=>h.id===session.attacker_house_id)?.name??session.attacker_house_id}
    · Defensor: {houses.find(h=>h.id===session.defender_house_id)?.name??session.defender_house_id}
    · Estado: {session.status} · Versão {session.state_version}</p>
   {session.status!=='closed'&&<Button size="sm" variant="outline" disabled={busy}
    onClick={()=>void finish(session.id)}>Encerrar treino remoto</Button>}
  </div>)}
  {status&&<p role="status">{status}</p>}
  <Button variant="outline" size="sm" onClick={()=>void refresh()}>Atualizar sessões</Button>
 </section>;
}
