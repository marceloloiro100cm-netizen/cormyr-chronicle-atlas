import {useEffect,useState,lazy,Suspense} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {checkBattlePersistence} from '@/lib/battle/battle-session.functions';
import {Button} from '@/components/ui/button';
import {BATTLE_RULES_VERSION,BATTLE_PERSISTENCE_UI_ENABLED,BATTLE_CRZ_TRAINING_UI_ENABLED} from '@/lib/battle/feature-flag';
import type {BattleState,Side} from '@/lib/battle/domain/types';
import {BattleSetup} from './BattleSetup';
import {BattleArena} from './BattleArena';
import {BattleReplayImporter} from './BattleReplay';
import {BattleSavedPanel} from './BattleSavedPanel';
import {BattleV3Game} from './BattleV3Game';
import {BattleV3InvitationCreator} from './BattleV3InvitationCreator';
import './battle.css';
import './battle-legibility.css';

// Lazy-load do laboratório experimental para não atrasar a batalha V3 oficial.
const BattleCrzLab=lazy(()=>import('./BattleCrzLab').then(m=>({default:m.BattleCrzLab})));


export function BattleNarratorHub(){
 const [view,setView]=useState<'home'|'setup'|'arena'|'saved'|'crusade'|'crz'|'invite'>('home');
 const [state,setState]=useState<BattleState|null>(null);
 const [resumeState,setResumeState]=useState<BattleState|null>(null);
 const [sideNames,setSideNames]=useState<Record<Side,string>>({attacker:'Atacante',defender:'Defensor'});
 const [manual,setManual]=useState(false);
 const [showImport,setShowImport]=useState(false);
 const checkStore=useServerFn(checkBattlePersistence);
 const [storeStatus,setStoreStatus]=useState<'checking'|'available'|'unavailable'>(
  BATTLE_PERSISTENCE_UI_ENABLED?'checking':'unavailable');
 const probeStore=async()=>{
  if(!BATTLE_PERSISTENCE_UI_ENABLED)return;
  setStoreStatus('checking');
  try{const status=await checkStore();setStoreStatus(status.available?'available':'unavailable');}
  catch{setStoreStatus('unavailable');}
 };
 useEffect(()=>{void probeStore();},[]);
 const canSave=BATTLE_PERSISTENCE_UI_ENABLED&&storeStatus==='available';
 const reset=()=>{
  if(state&&view==='arena'&&!window.confirm('As alterações não salvas serão perdidas. Deseja sair da simulação?'))return;
  setState(null);setResumeState(null);setView('home');
 };
 return <main className="battle-module" aria-label="Módulo de batalha do Narrador">
  <header className="battle-header">
   <p className="battle-eyebrow">CORMYR CHRONICLE ATLAS · NARRADOR</p>
   <h1>Módulo de batalha</h1>
   <p>Simulador tático · sem efeito nas fichas oficiais</p>
   <p><strong>{BATTLE_RULES_VERSION} — regras experimentais.</strong> Nenhuma baixa será lançada nas fichas das casas.</p>
  </header>
  {view==='home'&&<div className="battle-home battle-surface">
    <h2>Laboratório de batalha</h2>
    <p><strong>Batalhar:</strong> entre na Cruzada V3 com casas-modelo, habilidades e comandantes.
      <strong> Criar batalha:</strong> mantenha o laboratório PTE-2.0 com editor e unidades oficiais em cópia somente leitura.</p>
    <div className="battle-home-actions">
      <Button onClick={()=>setView('crusade')}>Batalhar</Button>
      {BATTLE_CRZ_TRAINING_UI_ENABLED&&<Button variant="outline"
       onClick={()=>setView('crz')}>CRZ-1.0 · Laboratório (teste)</Button>}
      <Button variant="outline" onClick={()=>setView('setup')}>Criar batalha</Button>
      <Button variant="outline" onClick={()=>setView('invite')}>Convocar batalha</Button>
      <Button variant="outline" onClick={()=>setManual(x=>!x)}>Consultar regras</Button>
      <Button variant="outline" onClick={()=>setShowImport(x=>!x)}>Importar replay JSON</Button>
      {canSave?<Button variant="outline" onClick={()=>setView('saved')}>Batalhas salvas</Button>:
        <Button variant="outline" disabled title="O servidor ainda não confirmou a autorização e o armazenamento">Batalhas salvas · {storeStatus==='checking'?'verificando…':'indisponíveis'}</Button>}
      {BATTLE_PERSISTENCE_UI_ENABLED&&storeStatus==='unavailable'&&<Button variant="outline" onClick={()=>void probeStore()}>Verificar salvamento</Button>}
    </div>
    {showImport&&<BattleReplayImporter/>}
    {manual&&<div className="battle-rules-help">
     <h3>Manual rápido PTE-2.0</h3>
     <p>Até 5 unidades por lado; a iniciativa ordena os turnos. Cada ativação permite um movimento e depois um ataque, ou defender, esperar uma vez, ou terminar.</p>
     <p>Floresta e colina custam 2 pontos de movimento; rocha é bloqueio. Floresta intermediária bloqueia tiro, e artilheiros não disparam quando engajados.</p>
     <p>Os PV, as baixas e a moral são exclusivos desta simulação. IA determinística habilitada. O armazenamento exige autorização atual do Narrador e verificação do servidor. Nenhum impacto sobre recursos da casa.</p>
    </div>}
  </div>}
  {view==='crusade'&&<BattleV3Game narrator onBack={()=>setView('home')}/>}
  {view==='crz'&&BATTLE_CRZ_TRAINING_UI_ENABLED&&<Suspense fallback={<p role="status">Carregando laboratório CRZ…</p>}>
   <BattleCrzLab onBack={()=>setView('home')}/>
  </Suspense>}
  {view==='invite'&&<BattleV3InvitationCreator onBack={()=>setView('home')}/>}
  {view==='saved'&&canSave&&<BattleSavedPanel onClose={()=>setView('home')}
    onResume={(ready,restored)=>{
      setState(ready);setResumeState(restored);
      setSideNames({attacker:'Atacante',defender:'Defensor'});
      setView('arena');
    }}/>}
  {view==='setup'&&<BattleSetup onBack={reset} onStart={(battle,names)=>{
    setResumeState(null);setState(battle);setSideNames(names);setView('arena');
  }}/>}
  {view==='arena'&&state&&<BattleArena initial={state}
    {...(resumeState?{resume:resumeState}:{})}
    sideNames={sideNames} persistenceEnabled={canSave} onExit={reset}/>}
 </main>;
}
