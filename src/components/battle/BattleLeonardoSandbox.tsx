import {lazy,Suspense,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {BattleRulesetSelector} from './BattleRulesetSelector';
import {BattleV3Game} from './BattleV3Game';
import {LeonardoPrivateHouseEditor} from './LeonardoPrivateHouseEditor';
import {loadPrivateHouse,privateHouseAsModel,type PrivateHouse} from '@/lib/battle/leonardo-private-house';
import type {BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import './battle-legibility.css';
import './battle-ui-v4.css';
import './battle-ruleset-selector.css';

// Explicit sandbox-only components. Never mount the Narrator hub, persistence,
// official source picker, invitations, multiplayer, or campaign write actions.
const GotSandbox=lazy(()=>import('./BattleGotGame').then(m=>({default:m.BattleGotGame})));
const DndSandbox=lazy(()=>import('./BattleCrzLab').then(m=>({default:m.BattleCrzLab})));

export function BattleLeonardoSandbox({userId}:{userId:string}){
 const [house,setHouse]=useState<PrivateHouse|null>(null);
 useEffect(()=>{
  try{setHouse(loadPrivateHouse(window.localStorage,userId));}
  catch{setHouse(null);}
 },[userId]);
 const [ruleset,setRuleset]=useState<BattleRulesetMode>('got');
 const [active,setActive]=useState<BattleRulesetMode|null>(null);
 if(active==='adapted')return <BattleV3Game
  customHouses={house?[privateHouseAsModel(house)]:[]}
  onBack={()=>setActive(null)}/>;
 if(active==='got')return <Suspense fallback={<p role="status">Carregando simulação Game of Thrones…</p>}>
  <GotSandbox playerSandbox onBack={()=>setActive(null)}/>
 </Suspense>;
 if(active==='dnd')return <Suspense fallback={<p role="status">Carregando simulação D&D…</p>}>
  <DndSandbox mode="dnd" playerSandbox onBack={()=>setActive(null)}/>
 </Suspense>;
 return <main className="battle-module crusade-mode" aria-label="Simulador de batalhas do usuário">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · ACESSO ESPECIAL</p>
   <h1>Simulador de batalhas</h1>
   <p>Monte confrontos, escolha os dois lados e jogue livremente, inclusive com IA quando disponível.</p>
  </header>
  <LeonardoPrivateHouseEditor userId={userId} house={house} onChange={setHouse}/>
  <section className="battle-surface" aria-label="Nova simulação">
   <BattleRulesetSelector value={ruleset} onChange={setRuleset}/>
   <p className="battle-note" role="status"><strong>Somente simulação.</strong> Casas e bandeiras
    públicas são referências. Tropas, perdas, XP, recursos, missivas, calendário e fichas
    oficiais da campanha não são modificados.</p>
   <Button onClick={()=>setActive(ruleset)}>Criar simulação</Button>
   <p className="battle-note">GOT: batalhas e exércitos-modelo por Casa.
    Adaptado: cruzadas táticas e comandantes. D&D: tropas e criaturas de treinamento.
    As simulações usam dados fictícios ou cópias locais, sem acesso às fichas privadas do Narrador.</p>
  </section>
 </main>;
}
