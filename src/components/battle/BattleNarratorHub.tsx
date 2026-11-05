import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {BATTLE_RULES_VERSION,BATTLE_PERSISTENCE_UI_ENABLED} from '@/lib/battle/feature-flag';
import type {BattleState,Side} from '@/lib/battle/domain/types';
import {BattleSetup} from './BattleSetup';
import {BattleArena} from './BattleArena';
import {BattleReplayImporter} from './BattleReplay';
import {BattleSavedPanel} from './BattleSavedPanel';
import './battle.css';

export function BattleNarratorHub(){
 const [view,setView]=useState<'home'|'setup'|'arena'|'saved'>('home');
 const [state,setState]=useState<BattleState|null>(null);
 const [resumeState,setResumeState]=useState<BattleState|null>(null);
 const [sideNames,setSideNames]=useState<Record<Side,string>>({attacker:'Atacante',defender:'Defensor'});
 const [manual,setManual]=useState(false);
 const [showImport,setShowImport]=useState(false);
 const reset=()=>{
  if(state&&view==='arena'&&!window.confirm('As alterações não salvas desta simulação serão perdidas. Deseja sair?'))return;
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
    <p>Prepare dois exércitos fictícios e conduza seus turnos em um mapa hexagonal independente.</p>
    <div className="battle-home-actions">
      <Button onClick={()=>setView('setup')}>Criar batalha</Button>
      <Button variant="outline" onClick={()=>setManual(x=>!x)}>Consultar regras</Button>
      <Button variant="outline" onClick={()=>setShowImport(x=>!x)}>Importar replay JSON</Button>
      {BATTLE_PERSISTENCE_UI_ENABLED?<Button variant="outline" onClick={()=>setView('saved')}>Batalhas salvas</Button>:
        <Button variant="outline" disabled title="Persistência desativada temporariamente">Batalhas salvas · indisponível</Button>}
    </div>
    {showImport&&<BattleReplayImporter/>}
    {manual&&<div className="battle-rules-help">
     <h3>Manual rápido PTE-2.0</h3>
     <p>Até 5 unidades por lado; a iniciativa ordena os turnos. Cada ativação permite um movimento e depois um ataque, ou defender, esperar uma vez, ou terminar.</p>
     <p>Floresta e colina custam 2 pontos de movimento; rocha é bloqueio. Floresta intermediária bloqueia tiro, e artilheiros não disparam quando engajados.</p>
     <p>Os PV, as baixas e a moral são exclusivos desta simulação. IA determinística habilitada. A persistência usa registros táticos independentes, sem afetar recursos da casa.</p>
    </div>}
  </div>}
  {view==='saved'&&BATTLE_PERSISTENCE_UI_ENABLED&&<BattleSavedPanel onClose={()=>setView('home')}
    onResume={(ready,loaded)=>{setState(ready);setResumeState(loaded);
      setSideNames({attacker:'Atacante',defender:'Defensor'});setView('arena');}}/>}
  {view==='setup'&&<BattleSetup onBack={reset} onStart={(battle,names)=>{
    setResumeState(null);setState(battle);setSideNames(names);setView('arena');
  }}/>}
  {view==='arena'&&state&&<BattleArena initial={state} resume={resumeState??undefined}
    sideNames={sideNames} onExit={reset}/>}
 </main>;
}
