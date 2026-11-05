import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listV3Invitations,type BattleV3Invitation} from '@/lib/battle/v3/invitations.functions';
import {BattleV3Game} from './BattleV3Game';
import {BattleV34PlayerButton,BattleV34PlayerLobby} from './BattleV34Remote';
import {BATTLE_V34_SYNC_UI_ENABLED} from '@/lib/battle/feature-flag';
import type {V3ScenarioOptions} from '@/lib/battle/v3/engine';
import type {CommanderId} from '@/lib/battle/v3/commanders';

function invitationOptions(value:BattleV3Invitation):V3ScenarioOptions{
 return {
  attackerHouseId:value.attacker_model_id,defenderHouseId:value.defender_model_id,
  attackerCommander:value.attacker_commander as CommanderId,
  defenderCommander:value.defender_commander as CommanderId,
  scenario:value.scenario as V3ScenarioOptions['scenario'],opponent:'ai',
 };
}
/** Jogador autenticado: Batalhar sempre; segundo botão somente quando o Narrador
 * possui uma convocação ativa destinada a uma casa da qual é membro.
 * A consulta é protegida por RLS + verificação de acesso no servidor.
 */
export function BattleV3PlayerEntry({houseId}:{houseId:string}){
 const list=useServerFn(listV3Invitations);
 const {data=[],isPending,isError,refetch}=useQuery({
  queryKey:['battle-v3-invitations',houseId],
  queryFn:()=>list(),
  refetchOnWindowFocus:'always',
  refetchInterval:30000,
  retry:false,
 });
 const invites=data.filter(i=>i.target_house_id===houseId&&i.status==='open');
 const [mode,setMode]=useState<'choose'|'training'|'invitations'|'playing'|'remote'>('choose');
 const [selected,setSelected]=useState<BattleV3Invitation|null>(null);
 if(mode==='training')return <BattleV3Game onBack={()=>setMode('choose')}/>;
 if(mode==='remote'&&BATTLE_V34_SYNC_UI_ENABLED)return <BattleV34PlayerLobby houseId={houseId}
  onBack={()=>setMode('choose')}/>;
 if(mode==='playing'&&selected)return <BattleV3Game key={selected.id}
  initialOptions={invitationOptions(selected)} locked invitationName={selected.title}
  onBack={()=>{setSelected(null);setMode('choose');}}/>;
 return <section className="battle-module crusade-mode" aria-label="Batalhas do jogador">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · EXÉRCITOS</p><h1>Batalha</h1>
   <p>Treinos independentes das suas fichas, atributos, exército e calendário.</p>
  </header>
  <div className="battle-surface">
   <div className="battle-home-actions">
    <Button onClick={()=>setMode('training')}>Batalhar</Button>
    {BATTLE_V34_SYNC_UI_ENABLED&&<BattleV34PlayerButton houseId={houseId}
     onOpen={()=>setMode('remote')}/>}
    {invites.length>0&&<Button variant="outline" onClick={()=>setMode('invitations')}>
     Batalha convocada ({invites.length})
    </Button>}
   </div>
   {mode==='invitations'&&<div className="crusade-invitation-list">
    <h2>Convocações do Narrador</h2>
    {invites.map(i=><article key={i.id} className="battle-result-card">
     <strong>{i.title}</strong>
     <p>Cenário: {i.scenario} · Simulação com exércitos-modelo</p>
     <Button onClick={()=>{setSelected(i);setMode('playing');}}>Entrar na batalha</Button>
    </article>)}
   </div>}
   {!isPending&&!isError&&<Button size="sm" variant="outline" onClick={()=>void refetch()}>Atualizar convocações</Button>}
   {isError&&<p className="battle-note">Convocações indisponíveis; o treinamento livre continua acessível.</p>}
   <p className="battle-note">Batalhas convocadas V3 são exercícios locais; nenhuma baixa é registrada oficialmente.
    Uma convocação não compartilha turnos entre dispositivos nesta fase.</p>
  </div>
 </section>;
}
