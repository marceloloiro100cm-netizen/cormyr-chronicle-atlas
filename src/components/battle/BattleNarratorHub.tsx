import {useState,lazy,Suspense} from 'react';
import {Button} from '@/components/ui/button';
import {BATTLE_RULES_VERSION} from '@/lib/battle/feature-flag';
import type {BattleState,Side} from '@/lib/battle/domain/types';
import {BattleSetup} from './BattleSetup';
import {BattleArena} from './BattleArena';
import './battle.css';

export function BattleNarratorHub(){
 const [view,setView]=useState<'home'|'setup'|'arena'>('home');
 const [state,setState]=useState<BattleState|null>(null);
 const [sideNames,setSideNames]=useState<Record<Side,string>>({attacker:'Atacante',defender:'Defensor'});
 const [manual,setManual]=useState(false);
 const reset=()=>{
  if(state&&view==='arena'&&!window.confirm('A batalha existe apenas na memória. Deseja sair e perdê-la?'))return;
  setState(null);setView('home');
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
      <Button variant="outline" disabled title="Disponível quando o armazenamento isolado for implementado">Batalhas salvas · futuro</Button>
    </div>
    {manual&&<div className="battle-rules-help">
     <h3>Manual rápido PTE-2.0</h3>
     <p>Até 5 unidades por lado; a iniciativa ordena os turnos. Cada ativação permite um movimento e depois um ataque, ou defender, esperar uma vez, ou terminar.</p>
     <p>Floresta e colina custam 2 pontos de movimento; rocha é bloqueio. Floresta intermediária bloqueia tiro, e artilheiros não disparam quando engajados.</p>
     <p>Os PV, as baixas e a moral são exclusivos desta simulação. Sem persistência, IA ou impacto sobre recursos da casa nesta etapa.</p>
    </div>}
  </div>}
  {view==='setup'&&<BattleSetup onBack={reset} onStart={(battle,names)=>{
    setState(battle);setSideNames(names);setView('arena');
  }}/>}
  {view==='arena'&&state&&<BattleArena initial={state} sideNames={sideNames} onExit={reset}/>}
 </main>;
}
