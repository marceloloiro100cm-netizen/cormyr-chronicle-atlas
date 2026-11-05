/** Test-only browser surface. Never imports secrets, server APIs or real HouseState. */
import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {BattleMapEditor} from '@/components/battle/BattleMapEditor';
import {BattleReplay,BattleReplayImporter} from '@/components/battle/BattleReplay';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle} from '@/lib/battle/domain/turns';
import {runAiUntilHuman} from '@/lib/battle/domain/ai';
import {captureReplay} from '@/lib/battle/domain/replay';
import {hexKey} from '@/lib/battle/geometry/hex';
import '@/components/battle/battle.css';

function TestHarness(){
 const [map,setMap]=useState(()=>createScenario('plain-open'));
 const [selectedHex,setSelectedHex]=useState('nenhum');
 const {initial,completed,replay}=useMemo(()=>{
  const field=createScenario('plain-open');
  const [attacker,defender]=[
   makeFictionalStack({id:'synthetic-attacker',side:'attacker',name:'Infantaria fictícia',typeId:'infantry',
    training:'trained',count:40,position:field.deployment.attacker[0]!}),
   makeFictionalStack({id:'synthetic-defender',side:'defender',name:'Arqueiros fictícios',typeId:'archers',
    training:'green',count:40,position:field.deployment.defender[0]!}),
  ];
  const initial=makeBattleSetup({
   id:'browser-e2e-test',name:'Simulação fictícia de homologação',seed:'browser-test-fixed',
   map:field,controls:{attacker:'ai',defender:'ai'},stacks:[attacker,defender],
  });
  const outcome=runAiUntilHuman(startBattle(initial),900);
  return {initial,completed:outcome.state,replay:JSON.stringify(captureReplay(initial,outcome.commands))};
 },[]);
 Object.assign(window,{__battleE2eReplay:replay});
 return <main className="battle-module">
  <h1>Homologação sintética do módulo de batalha</h1>
  <p id="synthetic-notice">Somente dados fictícios. Não conectado a fichas oficiais ou Supabase.</p>
  <section id="interactive-board" aria-label="Tabuleiro interativo de teste">
   <h2>Tabuleiro de seleção</h2>
   <p data-testid="selected-hex" role="status">Hexágono selecionado: {selectedHex}</p>
   <BattleBoard map={map} onHexClick={hex=>setSelectedHex(hexKey(hex))}/>
  </section>
  <section id="map-editor" aria-label="Editor de teste">
   <BattleMapEditor map={map} onChange={setMap}/>
  </section>
  <section id="verified-replay" aria-label="Replay de teste">
   <BattleReplay initial={initial} state={completed}/>
  </section>
  <section id="replay-import" aria-label="Importador de teste">
   <BattleReplayImporter/>
  </section>
 </main>;
}
createRoot(document.getElementById('battle-e2e-root')!).render(<TestHarness/>);
