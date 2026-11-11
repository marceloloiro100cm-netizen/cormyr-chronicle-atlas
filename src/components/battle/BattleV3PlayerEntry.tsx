import {useState,lazy,Suspense} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listV3Invitations,type BattleV3Invitation} from '@/lib/battle/v3/invitations.functions';
import {BattleV3Game} from './BattleV3Game';
import {BattleRulesetSelector} from './BattleRulesetSelector';
import type {BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import {BattleAccessCheck} from './BattleAccessCheck';
import {BATTLE_V3_LIVE_ENABLED} from '@/lib/battle/feature-flag';
import {listLiveV3Matches} from '@/lib/battle/v3/live.functions';
import {BattleV3LiveArena} from './BattleV3Live';
import type {V3ScenarioOptions} from '@/lib/battle/v3/engine';
import './battle.css';
import './battle-legibility.css';
import './battle-ui-v4.css';
import './battle-cleanup.css';
import './battle-ruleset-selector.css';
import type {CommanderId} from '@/lib/battle/v3/commanders';
const PlayerGotGame=lazy(()=>import('./BattleGotGame').then(m=>({default:m.BattleGotGame})));
const PlayerDndGame=lazy(()=>import('./BattleCrzLab').then(m=>({default:m.BattleCrzLab})));

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
 const listLive=useServerFn(listLiveV3Matches);
 const {data:liveData=[]}=useQuery({queryKey:['battle-v3-live-list',houseId],
  queryFn:()=>listLive(),enabled:BATTLE_V3_LIVE_ENABLED,
  refetchInterval:5000,refetchOnWindowFocus:'always',retry:false});
 const liveMatches=liveData.filter(m=>m.attacker_house_id===houseId||m.defender_house_id===houseId);
 const {data=[],isPending,isError,refetch}=useQuery({
  queryKey:['battle-v3-invitations',houseId],
  queryFn:()=>list(),
  refetchOnWindowFocus:'always',
  refetchInterval:30000,
  retry:false,
 });
 const invites=data.filter(i=>i.target_house_id===houseId&&i.status==='open');
 const [mode,setMode]=useState<'choose'|'training'|'got-training'|'dnd-training'|'invitations'|'playing'|'live-list'|'live-playing'>('choose');
 const [rulesetMode,setRulesetMode]=useState<BattleRulesetMode>('adapted');
 const [selected,setSelected]=useState<BattleV3Invitation|null>(null);
 const [selectedLive,setSelectedLive]=useState<string|null>(null);
 if(mode==='training')return <BattleV3Game onBack={()=>setMode('choose')}/>;
 if(mode==='got-training')return <main className="battle-module" aria-label="Simulação Game of Thrones do jogador">
  <Suspense fallback={<p role="status">Carregando Game of Thrones…</p>}>
   <PlayerGotGame playerSandbox onBack={()=>setMode('choose')}/>
  </Suspense>
 </main>;
 if(mode==='dnd-training')return <main className="battle-module" aria-label="Simulação D&D do jogador">
  <Suspense fallback={<p role="status">Carregando D&D simplificado…</p>}>
   <PlayerDndGame mode="dnd" playerSandbox onBack={()=>setMode('choose')}/>
  </Suspense>
 </main>;
 if(mode==='live-playing'&&selectedLive)return <BattleV3LiveArena id={selectedLive}
  onBack={()=>{setSelectedLive(null);setMode('choose');}}/>;
 if(mode==='playing'&&selected)return <BattleV3Game key={selected.id}
  initialOptions={invitationOptions(selected)} locked invitationName={selected.title}
  onBack={()=>{setSelected(null);setMode('choose');}}/>;
 return <section className="battle-module crusade-mode" aria-label="Batalhas do jogador">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · EXÉRCITOS</p><h1>Batalha</h1>
   <p>Treinos independentes das suas fichas, atributos, exército e calendário.</p>
  </header>
  <div className="battle-surface">
   <BattleRulesetSelector value={rulesetMode} onChange={setRulesetMode}/>
   <p className="battle-note">Batalhas livres usam apenas exércitos-modelo e não
    alteram unidades oficiais, ficha, recursos, XP ou calendário da campanha.</p>
   <div className="battle-home-actions">
    <Button onClick={()=>setMode(rulesetMode==='got'?'got-training':
     rulesetMode==='dnd'?'dnd-training':'training')}>Batalhar</Button>
    {BATTLE_V3_LIVE_ENABLED&&liveMatches.length>0&&<Button variant="outline"
      onClick={()=>setMode('live-list')}>Batalhas multiplayer ({liveMatches.length})</Button>}
    {invites.length>0&&<Button variant="outline" onClick={()=>setMode('invitations')}>
     Batalha convocada ({invites.length})
    </Button>}
   </div>
   {mode==='live-list'&&<div className="crusade-invitation-list">
    <h2>Partidas compartilhadas</h2>
    {liveMatches.map(m=><article key={m.id} className="battle-result-card">
     <strong>{m.title}</strong><p>Status: {m.status} · versão {m.state_version}</p>
     <Button onClick={()=>{setSelectedLive(m.id);setMode('live-playing');}}>Entrar no multiplayer</Button>
    </article>)}
   </div>}
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
   <BattleAccessCheck role="player"/>
   <p className="battle-note">Batalhas convocadas V3 são exercícios locais; nenhuma baixa é registrada oficialmente.
    Uma convocação não compartilha turnos entre dispositivos nesta fase.</p>
  </div>
 </section>;
}
