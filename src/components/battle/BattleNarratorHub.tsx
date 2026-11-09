import {useEffect,useState,lazy,Suspense} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {checkBattlePersistence} from '@/lib/battle/battle-session.functions';
import {Button} from '@/components/ui/button';
import {BATTLE_PERSISTENCE_UI_ENABLED,BATTLE_CRZ_TRAINING_UI_ENABLED,BATTLE_V3_LIVE_ENABLED,BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';
import type {BattleState,Side} from '@/lib/battle/domain/types';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import {BattleSetup} from './BattleSetup';
import {BattleArena} from './BattleArena';
import {BattleReplayImporter} from './BattleReplay';
import {BattleSavedPanel} from './BattleSavedPanel';
import {BattleV3NarratorEntry} from './BattleV3NarratorEntry';
import {BattleAccessCheck} from './BattleAccessCheck';
import {BattleRulesetSelector} from './BattleRulesetSelector';
import {BattleSaveScope} from './BattleSaveScope';
import {BattleGotGame} from './BattleGotGame';
import {battleRulesetOption,type BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import {BattleV3InvitationCreator} from './BattleV3InvitationCreator';
import {BattleV3LiveCreator} from './BattleV3Live';
import './battle.css';
import './battle-legibility.css';
import './battle-ui-v4.css';
import './battle-cleanup.css';
import './battle-ruleset-selector.css';

// Lazy-load do laboratório experimental para não atrasar a batalha V3 oficial.
const BattleCrzLab=lazy(()=>import('./BattleCrzLab').then(m=>({default:m.BattleCrzLab})));
const BattleStrategicLab=lazy(()=>import('./BattleStrategicLab').then(m=>({default:m.BattleStrategicLab})));


export function BattleNarratorHub(){
 const [view,setView]=useState<'home'|'setup'|'arena'|'saved'|'crusade'|'crz'|'invite'|'live'|'strategy'|'got'|'dnd'>('home');
 const [rulesetMode,setRulesetMode]=useState<BattleRulesetMode>('adapted');
 const ruleset=battleRulesetOption(rulesetMode);
 const [state,setState]=useState<BattleState|null>(null);
 const [resumeState,setResumeState]=useState<BattleState|null>(null);
 const [sideNames,setSideNames]=useState<Record<Side,string>>({attacker:'Atacante',defender:'Defensor'});
 const [sideHeraldry,setSideHeraldry]=useState<Partial<Record<Side,BattleHouseDirectoryRow>>>({});
 const [manual,setManual]=useState(false);
 const [showImport,setShowImport]=useState(false);
 const [showDiagnostic,setShowDiagnostic]=useState(false);
 const [resumeDnd,setResumeDnd]=useState(false);
 const [resumeGot,setResumeGot]=useState(false);
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
  setState(null);setResumeState(null);setSideHeraldry({});setView('home');
 };
 return <main className="battle-module" aria-label="Módulo de batalha do Narrador">
  <header className="battle-header">
   <p className="battle-eyebrow">CORMYR CHRONICLE ATLAS · NARRADOR</p>
   <h1>Módulo de batalha</h1>
   <p>Batalhas de treinamento. Nenhuma perda é lançada nas Casas.</p>
  </header>
  {view==='home'&&<div className="battle-home-dashboard">
   <section className="battle-surface battle-home-primary" aria-label="Iniciar batalha">
    <h2>Nova batalha</h2>
    <p>Escolha as regras e comece. Ajustes detalhados são opcionais.</p>
    <BattleRulesetSelector value={rulesetMode} onChange={setRulesetMode}/>
    {rulesetMode==='adapted'?<>
    <div className="battle-home-single-action">
     <Button onClick={()=>setView('setup')}>Criar batalha</Button>
     <p className="battle-note">Forças-modelo e posicionamento automático disponíveis.</p>
    </div>
    </>:rulesetMode==='got'?<section className="battle-ruleset-pending" aria-label="Guerra do livro">
     <h3>Guerra dos Tronos</h3>
     <p>Ordens, Disciplina e combates do livro. Regras especiais em teste.</p>
     <Button onClick={()=>{setResumeGot(false);setView('got');}}>Criar batalha</Button>
    </section>:<section className="battle-ruleset-pending" aria-label="Preparação do sistema selecionado">
     <h3>Combate D&D</h3>
     <p>D20, CA, PV e criaturas. Regras 5e simplificadas.</p>
     <Button onClick={()=>{setResumeDnd(false);setView('dnd');}}>Criar batalha</Button>
    </section>}
   </section>
   <aside className="battle-home-side" aria-label="Continuação e opções de batalha">
    <section className="battle-surface" aria-label="Continuar batalha">
     <h3>Continuar</h3>
     <BattleSaveScope system={rulesetMode}/>
     {rulesetMode==='adapted'?
      (canSave?<Button variant="outline" onClick={()=>setView('saved')}>Continuar batalha</Button>:
       <p className="battle-note" role="status">Salvamento Adaptado {storeStatus==='checking'?
        'em verificação':'indisponível neste ambiente'}. É possível exportar replays locais.</p>):
      rulesetMode==='got'?<>
       <Button variant="outline" onClick={()=>{setResumeGot(true);setView('got');}}>
        Continuar batalha
       </Button>
       <p className="battle-note">Selecione uma cópia local para continuar.</p>
      </>:<>
       <Button variant="outline" onClick={()=>{setResumeDnd(true);setView('dnd');}}>
        Continuar batalha
       </Button>
       <p className="battle-note">Selecione sua batalha privada.</p>
      </>}
    </section>
    <details className="battle-surface battle-home-advanced">
     <summary>Mais opções</summary>
     <div className="battle-home-secondary-actions">
      {rulesetMode==='adapted'&&<Button variant="outline" onClick={()=>setView('crusade')}>Cruzada com comandantes</Button>}
      {rulesetMode==='adapted'&&<Button variant="outline" onClick={()=>setManual(x=>!x)}
       aria-expanded={manual}>Consultar regras</Button>}
      {rulesetMode==='adapted'&&<Button variant="outline" onClick={()=>setShowImport(x=>!x)}
       aria-expanded={showImport}>Importar replay JSON</Button>}
      {rulesetMode==='adapted'&&BATTLE_CRZ_TRAINING_UI_ENABLED&&<Button variant="outline"
       onClick={()=>setView('crz')}>CRZ-1.0 · Laboratório (teste)</Button>}
      <Button variant="outline" onClick={()=>setView('strategy')}>Cercos e mapa estratégico · P3</Button>
      {BATTLE_PLAYERS_ENABLED&&<Button variant="outline"
       onClick={()=>setView('invite')}>Convocar batalha</Button>}
      {BATTLE_PLAYERS_ENABLED&&BATTLE_V3_LIVE_ENABLED&&<Button variant="outline"
       onClick={()=>setView('live')}>Convocar multiplayer</Button>}
      <Button variant="outline" aria-expanded={showDiagnostic}
       onClick={()=>setShowDiagnostic(x=>!x)}>Diagnóstico de acesso</Button>
      {BATTLE_PERSISTENCE_UI_ENABLED&&storeStatus==='unavailable'&&
       <Button variant="outline" onClick={()=>void probeStore()}>Verificar salvamento</Button>}
     </div>
     {rulesetMode==='adapted'&&showImport&&<BattleReplayImporter/>}
     {rulesetMode==='adapted'&&manual&&<div className="battle-rules-help">
      <h3>Manual rápido PTE-2.0</h3>
      <p>Até 5 agrupamentos por lado. Cada ativação permite mover e atacar, defender,
       esperar uma vez ou encerrar o turno.</p>
      <p>Floresta e colina custam 2 pontos de movimento; rocha é intransponível.
       Linha de visão e engajamento limitam disparos. Dano e moral valem apenas no tabuleiro.</p>
      <p>Os dados reais das casas, quando consultados, são copiados somente para treino.
       Nenhum resultado altera exércitos, XP, recursos ou calendário.</p>
     </div>}
     {showDiagnostic&&<BattleAccessCheck role="narrator"/>}
    </details>
   </aside>
  </div>}
  {view==='got'&&<BattleGotGame resumeFromLibrary={resumeGot} onBack={()=>setView('home')}/>}
  {view==='crusade'&&<BattleV3NarratorEntry onBack={()=>setView('home')}/>}
  {view==='crz'&&BATTLE_CRZ_TRAINING_UI_ENABLED&&<Suspense fallback={<p role="status">Carregando laboratório CRZ…</p>}>
   <BattleCrzLab onBack={()=>setView('home')}/>
  </Suspense>}
  {view==='dnd'&&<Suspense fallback={<p role="status">Carregando D&D simplificado…</p>}>
   <BattleCrzLab mode="dnd" showSavedOnOpen={resumeDnd} onBack={()=>setView('home')}/>
  </Suspense>}
  {view==='invite'&&BATTLE_PLAYERS_ENABLED&&<BattleV3InvitationCreator onBack={()=>setView('home')}/>}
  {view==='strategy'&&<Suspense fallback={<p role="status">Carregando mapa de operações…</p>}>
   <BattleStrategicLab onBack={()=>setView('home')}/>
  </Suspense>}
  {view==='live'&&BATTLE_PLAYERS_ENABLED&&BATTLE_V3_LIVE_ENABLED&&<BattleV3LiveCreator onBack={()=>setView('home')}/>}
  {view==='saved'&&canSave&&<BattleSavedPanel onClose={()=>setView('home')}
    onResume={(ready,restored)=>{
      setState(ready);setResumeState(restored);
      setSideNames({attacker:'Atacante',defender:'Defensor'});
      setSideHeraldry({});
      setView('arena');
    }}/>}
  {view==='setup'&&<BattleSetup onBack={reset} onStart={(battle,names,heraldry)=>{
    setResumeState(null);setState(battle);setSideNames(names);setSideHeraldry(heraldry??{});setView('arena');
  }}/>}
  {view==='arena'&&state&&<BattleArena initial={state}
    {...(resumeState?{resume:resumeState}:{})}
    sideNames={sideNames} heraldry={sideHeraldry} persistenceEnabled={canSave} onExit={reset}/>}
 </main>;
}
