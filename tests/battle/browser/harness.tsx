/** Test-only browser surface. Never imports secrets, server APIs or real HouseState. */
import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button} from '@/components/ui/button';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {BattleArena} from '@/components/battle/BattleArena';
import {BattleFirstBattleGuide} from '@/components/battle/BattleFirstBattleGuide';
import {BattleMapEditor} from '@/components/battle/BattleMapEditor';
import {MiniatureDemo} from '@/components/battle/miniatures3d/MiniatureDemo';
import {MiniatureViewport} from '@/components/battle/miniatures3d/MiniatureViewport';
import {miniatureCatalog} from '@/lib/battle/visual3d/demo';
import {BattleReplay,BattleReplayImporter} from '@/components/battle/BattleReplay';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeTacticalObjective} from '@/lib/battle/domain/objectives';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {startBattle} from '@/lib/battle/domain/turns';
import {runAiUntilHuman} from '@/lib/battle/domain/ai';
import {captureReplay} from '@/lib/battle/domain/replay';
import {hexKey} from '@/lib/battle/geometry/hex';
import '@/components/battle/battle.css';

function TestHarness(){
 const [map,setMap]=useState(()=>createScenario('plain-open'));
 const [selectedHex,setSelectedHex]=useState('nenhum');
 const [loadCount,setLoadCount]=useState<0|40|80>(0);
 const loadDemo=useMemo(()=>{
  const {map,tokens}=miniatureCatalog();
  return {map,tokens:Array.from({length:80},(_,i)=>({
   ...tokens[i%tokens.length]!,id:'stress-'+i,count:i+1,
   position:{q:i%map.width,r:Math.floor(i/map.width)},
  }))};
 },[]);
 const [arena,setArena]=useState<'none'|'v3'|'crz'|'got'|'dnd'|'adapted'|'adapted-goal'|'adapted-p3'>('none');
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
  <section id="battle-legibility-probe" className="battle-home battle-surface"
   aria-label="Amostra visual do laboratório">
   <h2>Laboratório de batalha</h2>
   <p><strong>Treinamento:</strong> comandos claros e fáceis de ler,
    inclusive no menu do Narrador.</p>
   <div className="battle-home-actions">
    <Button>Iniciar ensaio visual</Button>
    <Button variant="outline">Criar batalha visual</Button>
    <Button variant="outline" disabled>Batalhas salvas indisponíveis</Button>
   </div>
  </section>
  <section id="p2-tutorial" aria-label="Tutorial P2 de teste">
   <BattleFirstBattleGuide mode="adapted"/>
  </section>
  <section id="v4-visual-acceptance" aria-label="Arenas V4 de homologação">
   <nav aria-label="Laboratórios sintéticos V4">
    <button type="button" onClick={()=>setArena('v3')}>Abrir arena V3</button>
    <button type="button" onClick={()=>setArena('crz')}>Abrir arena CRZ</button>
    <button type="button" onClick={()=>setArena('got')}>Abrir arena GOT</button>
    <button type="button" onClick={()=>setArena('dnd')}>Abrir arena D&amp;D</button>
    <button type="button" onClick={()=>setArena('adapted')}>Abrir arena Adaptado</button>
    <button type="button" onClick={()=>setArena('adapted-goal')}>Abrir objetivo Adaptado</button>
    <button type="button" onClick={()=>setArena('adapted-p3')}>Abrir missão P3</button>
    <button type="button" onClick={()=>setArena('none')}>Fechar arenas</button>
   </nav>
   {arena==='v3'&&<BattleV3Game initialOptions={{
    attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
    attackerCommander:'tillet',defenderCommander:'ashkar-raider',
    scenario:'plain-open',opponent:'human',
   }}/>}
   {arena==='crz'&&<BattleCrzLab/>}
   {arena==='got'&&<BattleGotGame playerSandbox onBack={()=>setArena('none')}/>}
   {arena==='dnd'&&<BattleCrzLab mode="dnd" playerSandbox onBack={()=>setArena('none')}/>}
   {arena==='adapted-p3'&&<BattleArena initial={{...initial,id:'browser-e2e-multi',
    map:createScenario('bridge-crossing'),
    objective:makeTacticalObjective('bridge',createScenario('bridge-crossing'))!,
    aiProfiles:{defender:'defensive'},
    controls:{attacker:'human',defender:'ai'}}}
    sideNames={{attacker:'Atacantes fictícios',defender:'Defensores fictícios'}}
    onExit={()=>setArena('none')}/>}
   {arena==='adapted-goal'&&<BattleArena initial={{...initial,id:'browser-e2e-objective',
    objective:{kind:'capture',position:{q:5,r:4},holdRounds:2,deadlineRound:8},
    controls:{attacker:'human',defender:'human'}}}
    sideNames={{attacker:'Atacantes fictícios',defender:'Defensores fictícios'}}
    onExit={()=>setArena('none')}/>}
   {arena==='adapted'&&<BattleArena initial={{...initial,id:'browser-e2e-manual',
    controls:{attacker:'human',defender:'human'}}}
    sideNames={{attacker:'Atacantes fictícios',defender:'Defensores fictícios'}}
    onExit={()=>setArena('none')}/>}

  </section>
  <section id="miniatures-3d-acceptance" aria-label="Homologação isolada de miniaturas 3D">
   <h2>Miniaturas 3D · ensaio sintético do Narrador</h2>
   <p>Somente geometria fictícia, sem fichas, autenticação ou acesso ao banco da campanha.</p>
   <MiniatureDemo narrator/>
  </section>
  <section id="miniatures-3d-load" aria-label="Teste de carga de miniaturas 3D fictícias">
   <h2>Teste de 40 e 80 tokens rígidos</h2>
   <button type="button" onClick={()=>setLoadCount(40)}>Testar 40 miniaturas</button>
   <button type="button" onClick={()=>setLoadCount(80)}>Testar 80 miniaturas</button>
   <button type="button" onClick={()=>setLoadCount(0)}>Encerrar carga 3D</button>
   {loadCount>0&&<MiniatureViewport map={loadDemo.map}
    tokens={loadDemo.tokens.slice(0,loadCount)} selectedId="stress-0"
    fallback={<p>Mapa 3D indisponível no ensaio de carga.</p>}/>}
  </section>
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
