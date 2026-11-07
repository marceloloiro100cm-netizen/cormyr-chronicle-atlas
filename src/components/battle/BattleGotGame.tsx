import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {createWarBattle,issueWarOrder,advanceWarRound,warUnitSummary,fireWarSiegeVolley,skipWarSiege,completeWarHeroPhase} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import type {WarHeroAction} from '@/lib/battle/got/heroes';
import {makeWarFortification,WAR_FORT_PROFILES} from '@/lib/battle/got/fortifications';
import type {WarFortKind} from '@/lib/battle/got/fortifications';
import {makeModelSiege,WAR_SIEGE_CATALOG} from '@/lib/battle/got/siege';
import type {WarSiegeKind,WarSiegeAmmo} from '@/lib/battle/got/siege';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import type {WarBattle,WarOrder,WarOrderKind,WarUnit,WarSide} from '@/lib/battle/got/types';
import type {WarWeather,WarVisibility,WarTerrainId,WarTerrainTile} from '@/lib/battle/got/terrain';
import {WAR_TERRAIN} from '@/lib/battle/got/terrain';
import type {WarFormation,WarFacing} from '@/lib/battle/got/formations';
import {WAR_FORMATIONS} from '@/lib/battle/got/formations';
import {BattleGotSourcePicker} from './BattleGotSourcePicker';
import type {Slot} from './BattleGotSourcePicker';
import './battle-got.css';

type TypeId='infantry'|'archers'|'cavalry'|'garrison'|'raiders'|'engineers';
const OPTIONS:readonly {id:TypeId;label:string}[]=[
 {id:'infantry',label:'Infantaria'},{id:'archers',label:'Arqueiros'},
 {id:'cavalry',label:'Cavalaria'},{id:'garrison',label:'Guarnição'},
 {id:'raiders',label:'Saqueadores'},{id:'engineers',label:'Engenheiros'},
];
const SIDE:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
const ORDER_LABEL:Record<WarOrderKind,string>={
 attack:'Atacar',charge:'Carga',defend:'Defender',move:'Mover',ready:'Prontidão',
 rally:'Reagrupar',revive:'Reanimar',reorganize:'Reorganizar',
 retreat:'Retirada', 'aggressive-retreat':'Retirada agressiva',surrender:'Rendição geral',
 formation:'Alterar formação',turn:'Girar',reverse:'Reverter',
 suppress:'Fogo de supressão',probe:'Ataque exploratório',push:'Empurrar',
 'counter-charge':'Preparar contra carga',sabotage:'Sabotagem',
 ambush:'Emboscada',join:'Junção de unidades',
};
const CONDITION:Record<WarUnit['condition'],string>={
 organized:'Organizada',disorganized:'Desorganizada',routed:'Debandada',
 destroyed:'Destruída',surrendered:'Rendida',escaped:'Fora de campo',
};
export function BattleGotGame({onBack}:{onBack:()=>void}){
 const [battle,setBattle]=useState<WarBattle|null>(null);
 const [seed,setSeed]=useState('guerra-cormyr-livro');
 const [name,setName]=useState('Escaramuça de treinamento');
 const [warfare,setWarfare]=useState({attacker:3,defender:3});
 const [types,setTypes]=useState<Record<string,TypeId>>({
  'attacker-1':'infantry','attacker-2':'archers',
  'defender-1':'infantry','defender-2':'archers',
 });
 const [training,setTraining]=useState<WarUnit['training']>('trained');
 const [weather,setWeather]=useState<WarWeather>('clear');
 const [visibility,setVisibility]=useState<WarVisibility>('clear');
 const [advanced,setAdvanced]=useState(false);
 const [tiles,setTiles]=useState<WarTerrainTile[]>([]);
 const [terrainPaint,setTerrainPaint]=useState<WarTerrainId>('plain');
 const [formation,setFormation]=useState<WarFormation>('battle');
 const [facing,setFacing]=useState<WarFacing>('north');
 const [siegeEnabled,setSiegeEnabled]=useState(false);
 const [heroesEnabled,setHeroesEnabled]=useState(false);
 const [heroId,setHeroId]=useState('');
 const [heroAction,setHeroAction]=useState<WarHeroAction['kind']>('join');
 const [heroUnitId,setHeroUnitId]=useState('');
 const [heroTargetId,setHeroTargetId]=useState('');
 const [heroRanged,setHeroRanged]=useState(false);
 const [heroMetres,setHeroMetres]=useState({x:25,y:55});
 const [fortKind,setFortKind]=useState<WarFortKind|'none'>('none');
 const [fortEngineer,setFortEngineer]=useState(false);
 const [siegeKind,setSiegeKind]=useState<WarSiegeKind>('catapult-small');
 const [siegeAmmo,setSiegeAmmo]=useState<WarSiegeAmmo>('stone');
 const [officialBySlot,setOfficialBySlot]=useState<Partial<Record<Slot,WarUnit>>>({});
 const [selected,setSelected]=useState('');
 const [target,setTarget]=useState('');
 const [kind,setKind]=useState<WarOrderKind>('attack');
 const [ranged,setRanged]=useState(false);
 const [readyTrigger,setReadyTrigger]=useState<'enemy-adjacent'|'enemy-routed'>('enemy-adjacent');
 const [readyReaction,setReadyReaction]=useState<'attack'|'move'>('attack');
 const [sprint,setSprint]=useState(false);
 const [coord,setCoord]=useState({x:4,y:3});
 const [error,setError]=useState('');
 const start=()=>{
  try{
   const prepared=[
    {id:'attacker-1',side:'attacker' as WarSide,name:'Vanguarda atacante',position:{x:1,y:2}},
    {id:'attacker-2',side:'attacker' as WarSide,name:'Apoio atacante',position:{x:1,y:4}},
    {id:'defender-1',side:'defender' as WarSide,name:'Vanguarda defensora',position:{x:10,y:2}},
    {id:'defender-2',side:'defender' as WarSide,name:'Apoio defensor',position:{x:10,y:4}},
   ];
   if(siegeEnabled&&officialBySlot['attacker-2']&&
    officialBySlot['attacker-2'].typeId!=='engineers')
    throw new Error('O segundo espaço do atacante deve ter engenheiros para operar o cerco.');
   const units=prepared.map(row=>{
    const imported=officialBySlot[row.id as Slot];
    if(imported)return {...imported,side:row.side,position:row.position};
    return modelWarUnit({...row,training,
     typeId:siegeEnabled&&row.id==='attacker-2'?'engineers':types[row.id]??'infantry'});
   });
   const engineer=units.find(u=>u.side==='attacker'&&u.typeId==='engineers');
   if(siegeEnabled&&!engineer)throw new Error('Cerco exige unidade de engenheiros.');
   const siege=siegeEnabled&&engineer?[makeModelSiege({
    id:'siege-attacker-1',kind:siegeKind,side:'attacker',
    position:{x:1,y:3},engineerId:engineer.id,
    ammo:siegeKind.startsWith('catapult')?siegeAmmo:'stone',
   })]:[];
   setBattle(createWarBattle({id:'book-lab-'+seed,name,seed,width:12,height:7,
    units,siege,
    heroes:heroesEnabled?[
     makeModelWarHero({id:'hero-attacker',name:'Herói atacante',side:'attacker',
      position:{x:2,y:5}}),
     makeModelWarHero({id:'hero-defender',name:'Herói defensor',side:'defender',
      position:{x:9,y:5}}),
    ]:[],
    fortifications:fortKind==='none'?[]:[makeWarFortification({
     id:'defender-fort',name:WAR_FORT_PROFILES[fortKind].label,side:'defender',
     kind:fortKind,cells:WAR_FORT_PROFILES[fortKind].capacity===1?[{x:10,y:2}]:
      [{x:10,y:2},{x:10,y:4}],engineerBuilt:fortKind==='temporary'&&fortEngineer,
     hoursBuilt:fortKind==='temporary'?6:24,
    })],
    commanders:modelWarCommanders(warfare),tiles,weather,visibility,advancedFormations:advanced,
   }));
   setSelected('');setTarget('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao preparar a batalha.');}
 };
 const commander=battle?.commanders.find(c=>c.side===battle.turn&&c.role==='commander'&&c.active);
 const activeUnits=battle?.units.filter(u=>u.side===battle.turn&&
  !['destroyed','escaped','surrendered'].includes(u.condition))??[];
 const selectedUnit=activeUnits.find(u=>u.id===selected)??activeUnits[0];
 const enemy=battle?.units.filter(u=>u.side!==battle.turn&&
  !['destroyed','escaped','surrendered'].includes(u.condition))??[];
 const selectedTarget=enemy.find(u=>u.id===target)??enemy[0];
 const legalKind:WarOrderKind=selectedUnit?.condition==='routed'?'revive':kind;
 const order=()=>{
  if(!battle||!commander||!selectedUnit){setError('Selecione um comandante e uma unidade.');return;}
  try{
   if(legalKind==='surrender'&&!window.confirm('Confirmar rendição geral de todo este exército na simulação?'))return;
   const command:WarOrder={
    kind:legalKind,
    ...(['attack','charge','aggressive-retreat','suppress','probe','ambush','push'].includes(legalKind)&&selectedTarget?
     {targetId:selectedTarget.id}:{}),
    ...(legalKind==='join'?{targetId:activeUnits.find(u=>u.id!==selectedUnit.id)?.id??''}:{}),
    ...(legalKind==='sabotage'?{fortId:battle.fortifications.find(x=>x.side!==battle.turn)?.id??''}:{}),
    ...(legalKind==='move'?{to:coord,sprint}:{}),
    ...(legalKind==='ready'?{ready:{
     trigger:readyTrigger,reaction:readyReaction,
     ...(readyReaction==='move'?{to:coord}:{ranged}),
    }}:{}),
    ...(legalKind==='formation'?{formation}:{}),
    ...(legalKind==='turn'?{facing}:{}),
    ...(['attack','aggressive-retreat','ambush'].includes(legalKind)?{ranged}:{}),
   };
   const result=issueWarOrder(battle,{commanderId:commander.id,unitId:selectedUnit.id,order:command});
   setBattle(result.battle);setSelected('');setTarget('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Ordem não executada.');}
 };
 const siegeAction=(fire:boolean)=>{
  if(!battle||battle.phase!=='siege')return;
  try{
   const activeWeapons=battle.siege.filter(w=>w.side===battle.turn&&w.health>0);
   const leader=battle.commanders.find(x=>x.side===battle.turn&&x.role==='commander'&&x.active);
   const availableTargets=battle.units.filter(u=>u.side!==battle.turn&&
    !['destroyed','escaped','surrendered'].includes(u.condition));
   const selected=availableTargets.find(u=>u.id===target)??availableTargets[0];
   if(fire&&leader&&activeWeapons.length&&selected){
    setBattle(fireWarSiegeVolley(battle,{commanderId:leader.id,
     weaponIds:[activeWeapons[0]!.id],targetId:selected.id}));
   }else setBattle(skipWarSiege(battle));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Disparo não executado.');}
 };
 const heroDo=()=>{
  if(!battle)return;
  const hero=battle.heroes.find(h=>h.id===heroId)??battle.heroes.find(h=>h.active);
  if(!hero){setError('Não há herói ativo.');return;}
  try{
   const candidate=battle.units.find(u=>u.id===heroUnitId&&u.side===hero.side);
   const matching=battle.units.find(u=>u.side===hero.side&&u.condition==='organized'&&
    Math.max(Math.abs(u.position.x-hero.position.x),Math.abs(u.position.y-hero.position.y))<=1);
   const action:WarHeroAction={
    kind:heroAction,
    ...(['join','rally','revive'].includes(heroAction)?
     {unitId:candidate?.id??matching?.id??''}:{}),
    ...(['personal-attack','personal-charge'].includes(heroAction)?
     {targetHeroId:heroTargetId||battle.heroes.find(h=>h.side!==hero.side&&h.active)?.id||''}:{}),
    ...(heroAction==='personal-move'?{toMetres:heroMetres}:{}),
    ...(heroAction==='personal-attack'?{ranged:heroRanged}:{}),
   };
   setBattle(executeWarHeroAction(battle,{heroId:hero.id,action}));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível agir com o herói.');}
 };
 const heroFinish=()=>{
  if(!battle)return;
  try{setBattle(completeWarHeroPhase(battle));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Erro ao concluir a fase de heróis.');}
 };
 const endRound=()=>{
  if(!battle)return;
  try{setBattle(advanceWarRound(battle));setSelected('');setTarget('');setError('');}
  catch(e){setError(e instanceof Error?e.message:'Erro ao concluir rodada.');}
 };
 return <section className="battle-got" aria-label="Batalha pelas regras de Guerra dos Tronos RPG">
  <div className="battle-heading">
   <div><h2>Game of Thrones · regras do livro</h2>
    <p>Laboratório do capítulo 10 · quadrados de 10 m · uma rodada representa 1 minuto.</p></div>
   <Button variant="outline" onClick={onBack}>Voltar ao módulo</Button>
  </div>
  <p className="battle-note">Este motor é separado do Adaptado. O núcleo de ordens, iniciativa,
   dano, cerco inicial e moral já podem ser testados. Heróis, ordens avançadas,
   fortificações, efeitos especiais de cerco e consequências narrativas seguem incompletos.
   Nenhum resultado modifica a ficha oficial de uma Casa.</p>
  {!battle?<section className="battle-surface got-config" aria-label="Preparar campo de guerra">
   <h3>Preparar confronto conforme a escala do livro</h3>
   <label>Nome da batalha <input value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label>
   <label>Semente reprodutível <input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100}/></label>
   <div className="got-config-grid">
    {(['attacker','defender'] as const).map(side=><div key={side}>
     <h4>{SIDE[side]}</h4>
     <label>Guerra do comandante
      <select value={warfare[side]} onChange={e=>setWarfare(v=>({...v,[side]:Number(e.target.value)}))}>
       {[2,3,4,5,6].map(rank=><option key={rank} value={rank}>{rank}</option>)}
      </select>
     </label>
     {[1,2].map(n=>{
      const id=side+'-'+n;
      return <label key={id}>Unidade {n}
       <select value={types[id]} onChange={e=>setTypes(v=>({...v,[id]:e.target.value as TypeId}))}>
        {OPTIONS.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
       </select>
      </label>;
     })}
    </div>)}
   </div>
   <label>Treinamento das tropas-modelo
    <select value={training} onChange={e=>setTraining(e.target.value as WarUnit['training'])}>
     <option value="green">Verde</option><option value="trained">Treinada</option>
     <option value="veteran">Veterana</option><option value="elite">Elite</option>
    </select>
   </label>
   <div className="got-config-grid">
    <label>Clima
     <select value={weather} onChange={e=>setWeather(e.target.value as WarWeather)}>
      <option value="clear">Tempo aberto</option><option value="light-rain">Chuva leve</option>
      <option value="heavy-rain">Chuva forte</option><option value="light-snow">Neve leve</option>
      <option value="heavy-snow">Neve forte</option>
     </select>
    </label>
    <label>Visibilidade
     <select value={visibility} onChange={e=>setVisibility(e.target.value as WarVisibility)}>
      <option value="clear">Clara</option><option value="dim">Penumbra</option>
      <option value="dark">Escura</option>
     </select>
    </label>
   </div>
   <label className="got-check"><input type="checkbox" checked={heroesEnabled}
    onChange={e=>setHeroesEnabled(e.target.checked)}/>
    Dois heróis-modelo e fases individuais (Passos 6 e 8)</label>
   <label>Fortificação do defensor
    <select value={fortKind} onChange={e=>setFortKind(e.target.value as WarFortKind|'none')}>
     <option value="none">Sem fortificação</option>
     {Object.entries(WAR_FORT_PROFILES).map(([id,row])=><option key={id} value={id}>
      {row.label} · Defesa +{row.defense} · até {row.capacity} unidade(s)
     </option>)}
    </select>
   </label>
   {fortKind==='temporary'&&<label className="got-check">
    <input type="checkbox" checked={fortEngineer}
     onChange={e=>setFortEngineer(e.target.checked)}/>
    Construída por engenheiros (+2 Defesa total; seis horas antes da batalha)
   </label>}
   <label className="got-check"><input type="checkbox" checked={siegeEnabled}
    onChange={e=>setSiegeEnabled(e.target.checked)}/>
    Preparar arma de cerco do atacante (troca o apoio atacante por engenheiros)</label>
   {siegeEnabled&&<div className="got-config-grid">
    <label>Arma de cerco
     <select value={siegeKind} onChange={e=>setSiegeKind(e.target.value as WarSiegeKind)}>
      {Object.values(WAR_SIEGE_CATALOG).map(row=><option key={row.kind} value={row.kind}>
       {row.label} · alcance {row.rangeMetres} m</option>)}
     </select>
    </label>
    {siegeKind.startsWith('catapult')&&<label>Munição
     <select value={siegeAmmo} onChange={e=>setSiegeAmmo(e.target.value as WarSiegeAmmo)}>
      <option value="stone">Pedra</option><option value="oil">Óleo (ignora VA)</option>
     </select>
    </label>}
   </div>}
   <label className="got-check"><input type="checkbox" checked={advanced}
    onChange={e=>setAdvanced(e.target.checked)}/> Usar formações e ângulo frontal (opcional no livro)</label>
   <h4>Terreno do campo</h4>
   <label>Pintar quadrados com
    <select value={terrainPaint} onChange={e=>setTerrainPaint(e.target.value as WarTerrainId)}>
     {Object.keys(WAR_TERRAIN).map(id=><option key={id} value={id}>{id}</option>)}
    </select></label>
   <div className="got-map got-paint" style={{gridTemplateColumns:'repeat(12,minmax(0,1fr))'}}>
    {Array.from({length:84},(_,i)=>{
     const x=i%12,y=Math.floor(i/12),terrain=tiles.find(t=>t.x===x&&t.y===y)?.terrain??'plain';
     return <button type="button" key={i} className={'got-cell'+(terrain!=='plain'?' got-terrain':'')}
      title={terrain} aria-label={'Pintar quadrado '+x+','+y+' · '+terrain}
      onClick={()=>setTiles(prev=>[...prev.filter(t=>t.x!==x||t.y!==y),{x,y,terrain:terrainPaint}])}>
      {terrain==='plain'?'·':'▥'}
     </button>;
    })}
   </div>
   <p className="battle-note">Pinte o terreno antes de iniciar; cada quadrado tem 10 metros. Campos com obstáculos não são automaticamente removidos quando contêm tropas.</p>
   <BattleGotSourcePicker chosenSlots={officialBySlot} onChoose={(slot,unit)=>
    setOfficialBySlot(current=>{
     const next={...current};
     if(unit)next[slot]=unit;
     else delete next[slot];
     return next;
    })}/>
   <Button onClick={start}>Iniciar simulação pelo livro</Button>
  </section>:<>
   <section className="battle-surface got-status" aria-label="Estado da guerra" aria-live="polite">
    <h3>{battle.name}</h3>
    <p>Rodada <strong>{battle.round}</strong> · {battle.phase==='finished'?
     'Combate encerrado':battle.phase==='heroes-first'||battle.phase==='heroes-second'?
     'Ações individuais dos heróis':<>Comanda agora: <strong>{SIDE[battle.turn]}</strong></>}
     {' '}· Iniciativa: {SIDE[battle.first]}</p>
    <p>Ordens restantes: {battle.commanders.map(c=>
     c.name+': '+(battle.ordersRemaining[c.id]??0)).join(' · ')}</p>
    {battle.phase==='finished'&&<p role="status"><strong>
     {battle.winner?'Vitória do '+SIDE[battle.winner]:'Confronto sem vencedor'}
    </strong></p>}
   </section>
   {(battle.phase==='heroes-first'||battle.phase==='heroes-second')&&
    <section className="battle-surface got-heroes" aria-label="Ações individuais dos heróis">
     <h3>{battle.phase==='heroes-first'?'Passo 6 · Primeiras ações dos heróis':
      'Passo 8 · Segundas ações dos heróis'}</h3>
     <p className="battle-note">Cada fase equivale a cinco rodadas de 6 segundos.
      Combate pessoal usa posições de 1 metro, Luta/Pontaria contra Defesa,
      dano por grau de sucesso menos armadura e ações menores/maiores.
      Especialidades, equipamentos oficiais, iniciativa pessoal e ferimentos
      continuam em desenvolvimento; nenhuma baixa altera fichas da Casa.</p>
     <div className="got-config-grid">
      <label>Herói
       <select value={heroId||battle.heroes[0]?.id||''}
        onChange={e=>{setHeroId(e.target.value);
         const h=battle.heroes.find(row=>row.id===e.target.value);
         if(h)setHeroMetres(h.personalPosition??{
          x:h.position.x*10+5,y:h.position.y*10+5});
        }}>
        {battle.heroes.map(h=><option key={h.id} value={h.id}>
         {h.name} · Saúde {h.health}/{h.maxHealth} · {h.usedActions}/5 rodadas
        </option>)}
       </select>
      </label>
      <label>Ação
       <select value={heroAction} onChange={e=>setHeroAction(e.target.value as WarHeroAction['kind'])}>
        <option value="join">Entrar em unidade</option>
        {battle.phase==='heroes-second'&&<option value="leave">Sair de unidade</option>}
        <option value="rally">Reorganizar tropa</option>
        <option value="revive">Reanimar tropa</option>
        <option value="abdicate">Abdicar do comando</option>
        <option value="assume">Assumir comando vago</option>
        <option value="personal-attack">Combate pessoal · atacar (menor)</option>
        <option value="personal-charge">Combate pessoal · carga (maior)</option>
        <option value="personal-move">Combate pessoal · mover (menor)</option>
        <option value="personal-dodge">Combate pessoal · esquiva (maior)</option>
        <option value="personal-recover">Combate pessoal · recuperar o fôlego (maior)</option>
        <option value="personal-pass">Combate pessoal · passar (maior)</option>
        <option value="personal-end-turn">Combate pessoal · encerrar turno</option>
        <option value="personal-surrender">Combate pessoal · render-se (maior)</option>
       </select>
      </label>
      {['personal-attack','personal-charge'].includes(heroAction)&&
       <label>Herói adversário
        <select value={heroTargetId||battle.heroes.find(h=>h.side!==
         (battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side&&h.active)?.id||''}
         onChange={e=>setHeroTargetId(e.target.value)}>
         {battle.heroes.filter(h=>h.side!==
          (battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side&&h.active)
          .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
       </label>}
      {heroAction==='personal-attack'&&<label className="got-check">
       <input type="checkbox" checked={heroRanged} onChange={e=>setHeroRanged(e.target.checked)}/>
       Atacar usando Pontaria (distâncias pessoais em metros)</label>}
      {heroAction==='personal-move'&&<>
       <label>X em metros (quadrados de 1 m)
        <input type="number" min={0} max={battle.width*10-1} value={heroMetres.x}
         onChange={e=>setHeroMetres(v=>({...v,x:Number(e.target.value)}))}/></label>
       <label>Y em metros
        <input type="number" min={0} max={battle.height*10-1} value={heroMetres.y}
         onChange={e=>setHeroMetres(v=>({...v,y:Number(e.target.value)}))}/></label>
      </>}
      {['join','rally','revive'].includes(heroAction)&&<label>Unidade aliada
       <select value={heroUnitId} onChange={e=>setHeroUnitId(e.target.value)}>
        <option value="">Escolha uma unidade</option>
        {battle.units.filter(u=>u.side===(battle.heroes.find(h=>h.id===heroId)??
         battle.heroes[0])?.side).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
       </select>
      </label>}
     </div>
     <p className="battle-note">Posições individuais: {battle.heroes.map(h=>
      h.name+' ('+(h.personalPosition?.x??h.position.x*10+5)+','+
      (h.personalPosition?.y??h.position.y*10+5)+' m; '+
      h.usedActions+'/5 rodadas; '+(h.minorActionsUsed??0)+'/2 menores)').join(' · ')}</p>
     <div className="got-config-grid">
      <Button onClick={heroDo}>Executar ação individual</Button>
      <Button variant="outline" onClick={heroFinish}>Concluir cinco rodadas · avançar</Button>
     </div>
    </section>}
   <div className="got-columns">
    <section className="battle-surface got-map-panel" aria-label="Mapa em quadrados">
     <h3>Tabuleiro · 10 metros por quadrado</h3>
     <p>Clima: {battle.weather} · Visibilidade: {battle.visibility} · Formações avançadas: {battle.advancedFormations?'sim':'não'}</p>
     <p className="battle-note">Terreno do treino: terreno selecionado é destacado no mapa.</p>
     <div className="got-map" style={{gridTemplateColumns:'repeat('+battle.width+',minmax(0,1fr))'}}>
      {Array.from({length:battle.width*battle.height},(_,i)=>{
       const x=i%battle.width,y=Math.floor(i/battle.width);
       const occupant=battle.units.find(u=>u.position.x===x&&u.position.y===y&&
        !['destroyed','escaped','surrendered'].includes(u.condition));
       const isDestination=coord.x===x&&coord.y===y;
       const terrain=battle.tiles.find(t=>t.x===x&&t.y===y)?.terrain??'plain';
       return <button key={i} type="button"
        className={'got-cell'+(occupant?' occupied '+occupant.side:'')+(isDestination?' destination':'')+(terrain!=='plain'?' got-terrain':'')}
        aria-label={'Quadrado '+x+','+y+' · '+terrain+(occupant?' · '+occupant.name+' · '+CONDITION[occupant.condition]:'')}
        title={occupant?.name??terrain+' · '+x+','+y}
        onClick={()=>{
         setCoord({x,y});
         if(occupant){
          if(occupant.side===battle.turn)setSelected(occupant.id);
          else setTarget(occupant.id);
         }
        }}>
        {occupant?<><strong>{occupant.side==='attacker'?'A':'D'}</strong><small>{occupant.name.split(' ')[0]}</small></>:
         <span className="got-cell-dot" aria-hidden="true">{terrain==='plain'?'·':'▥'}</span>}
       </button>;
      })}
     </div>
     <p className="battle-note">Toque em um quadrado para indicar o destino ou selecionar uma tropa.
      Tropas destruídas ou fora de campo não ocupam mais quadrados.</p>
    </section>
    <section className="battle-surface got-order-panel" aria-label="Dar ordem de guerra">
     <h3>Comando e Disciplina</h3>
     {battle.phase==='siege'&&<div className="got-order-fields">
      <p>Passo 5 · Armas de cerco. Uma ordem dispara até Guerra máquinas;
       cada unidade de engenheiros opera até quatro. A arma precisa pular a rodada seguinte
       para recarregar.</p>
      {battle.siege.filter(w=>w.side===battle.turn&&w.health>0).map(w=><p key={w.id}>
       <strong>{w.name}</strong> · alcance {WAR_SIEGE_CATALOG[w.kind].rangeMetres} m
       · última rodada disparada {w.lastFiredRound??'nenhuma'}</p>)}
      {battle.siege.some(w=>w.side===battle.turn&&w.health>0)&&<label>Alvo da arma de cerco
       <select aria-label="Alvo de cerco" value={selectedTarget?.id??''}
        onChange={e=>setTarget(e.target.value)}>
        {enemy.map(u=><option key={u.id} value={u.id}>{u.name} · Saúde {u.health}/{u.maxHealth}</option>)}
       </select></label>}
      {battle.siege.some(w=>w.side===battle.turn&&w.health>0)&&
       <Button onClick={()=>siegeAction(true)}>Disparar arma de cerco</Button>}
      <Button variant="outline" onClick={()=>siegeAction(false)}>Sem disparos · prosseguir</Button>
     </div>}
     {battle.phase==='orders'&&commander&&selectedUnit?<div className="got-order-fields">
      <p><strong>{commander.name}</strong> · Guerra {commander.warfare} ·
       {battle.ordersRemaining[commander.id]??0} ordem(ns) disponível(is)</p>
      <label>Unidade comandada
       <select aria-label="Unidade comandada" value={selectedUnit.id}
        onChange={e=>setSelected(e.target.value)}>
        {activeUnits.map(u=><option key={u.id} value={u.id}>{u.name} · {CONDITION[u.condition]}</option>)}
       </select>
      </label>
      <p>Disciplina atual: <strong>{warUnitSummary(selectedUnit).discipline+
       selectedUnit.issuedThisRound*3}</strong> ·
       {selectedUnit.issuedThisRound} ordem(ns) recebida(s) nesta rodada</p>
      <label>Ordem
       <select aria-label="Ordem do livro" value={legalKind}
        onChange={e=>setKind(e.target.value as WarOrderKind)}>
        {Object.entries(ORDER_LABEL).filter(([id])=>selectedUnit.condition==='routed'?
         id==='revive':id!=='revive'&&(id!=='reorganize'||selectedUnit.condition==='disorganized'))
         .filter(([id])=>battle.advancedFormations||
          !['formation','turn','reverse','suppress','probe','counter-charge','sabotage','ambush','join','push'].includes(id))
         .map(([id,label])=><option key={id} value={id}>{label}</option>)}
       </select>
      </label>
      {legalKind==='ready'&&<div className="got-config-grid">
       <label>Disparar prontidão quando
        <select aria-label="Condição da prontidão" value={readyTrigger}
         onChange={e=>setReadyTrigger(e.target.value as typeof readyTrigger)}>
         <option value="enemy-adjacent">Inimigo entrar em quadrado adjacente</option>
         <option value="enemy-routed">Unidade inimiga debandar</option>
        </select>
       </label>
       <label>Reação preparada
        <select aria-label="Reação da prontidão" value={readyReaction}
         onChange={e=>setReadyReaction(e.target.value as typeof readyReaction)}>
         <option value="attack">Atacar</option><option value="move">Mover</option>
        </select>
       </label>
       {readyReaction==='attack'&&<label className="got-check">
        <input type="checkbox" checked={ranged}
         onChange={e=>setRanged(e.target.checked)}/>
        Ataque de Pontaria (quando equipada)</label>}
      </div>}
      {['attack','charge','aggressive-retreat','suppress','probe','ambush','push'].includes(legalKind)&&<>
       <label>Alvo
        <select aria-label="Alvo da ordem" value={selectedTarget?.id??''}
         onChange={e=>setTarget(e.target.value)}>
         {enemy.map(u=><option key={u.id} value={u.id}>{u.name} · {warUnitSummary(u).health}</option>)}
        </select>
       </label>
       {['attack','aggressive-retreat','ambush'].includes(legalKind)&&<label className="got-check">
        <input type="checkbox" checked={ranged} onChange={e=>setRanged(e.target.checked)}/>
        Usar Pontaria (quando houver arma à distância)</label>}
      </>}
      {legalKind==='sabotage'&&<label>Fortificação inimiga
       <select value={battle.fortifications.find(f=>f.side!==battle.turn)?.id??''}
        disabled aria-label="Fortificação alvo da sabotagem">
        {battle.fortifications.filter(f=>f.side!==battle.turn).map(f=>
         <option key={f.id} value={f.id}>{f.name}</option>)}
       </select>
      </label>}
      {legalKind==='join'&&<p className="battle-note">
       Junção: o segundo agrupamento aliado será escolhido automaticamente entre as
       unidades disponíveis. Ambas devem estar feridas e adjacentes.</p>}
      {battle.advancedFormations&&legalKind==='formation'&&<label>Formação
       <select value={formation} onChange={e=>setFormation(e.target.value as WarFormation)}>
        {Object.keys(WAR_FORMATIONS).map(id=><option key={id} value={id}>{id}</option>)}
       </select></label>}
      {battle.advancedFormations&&legalKind==='turn'&&<label>Direção
       <select value={facing} onChange={e=>setFacing(e.target.value as WarFacing)}>
        <option value="north">Norte</option><option value="east">Leste</option>
        <option value="south">Sul</option><option value="west">Oeste</option>
       </select></label>}
      {(legalKind==='move'||(legalKind==='ready'&&readyReaction==='move'))&&<>
       <label>Coluna X <input type="number" min={0} max={battle.width-1} value={coord.x}
        onChange={e=>setCoord(v=>({...v,x:Number(e.target.value)}))}/></label>
       <label>Linha Y <input type="number" min={0} max={battle.height-1} value={coord.y}
        onChange={e=>setCoord(v=>({...v,y:Number(e.target.value)}))}/></label>
       {legalKind==='move'&&<label className="got-check"><input type="checkbox" checked={sprint}
        onChange={e=>setSprint(e.target.checked)}/> Correr (linha reta)</label>}
      </>}
      <Button onClick={order} disabled={(battle.ordersRemaining[commander.id]??0)<1}>
       Emitir ordem · testar Guerra
      </Button>
     </div>:<p>As ordens terminaram ou a batalha está concluída.</p>}
     {battle.phase==='orders'&&<Button variant="outline" onClick={endRound}>
      Concluir rodada · ordens contínuas
     </Button>}
     <h4>Tropas no campo</h4>
     <div className="got-roster">{battle.units.map(u=><div className="got-unit" key={u.id}>
      <strong>{u.name}</strong><span>{SIDE[u.side]} · {CONDITION[u.condition]}</span>
      <span>Saúde {u.health}/{u.maxHealth} · Defesa {u.defendRoll??u.defense} · VA {u.armor}</span>
      <span>Disciplina {warUnitSummary(u).discipline} · Desorganizações {u.disorganizations}</span>
      {battle.advancedFormations&&<span>Formação {u.formation} · Direção {u.facing}</span>}
     </div>)}</div>
    </section>
   </div>
   {battle.phase==='finished'&&<section className="battle-surface got-after" aria-label="Prévia de sobreviventes">
    <h3>Resultado pós-batalha · somente projeção</h3>
    <p className="battle-note">A tabela de sobreviventes é calculada com dados auditáveis. Nenhuma perda,
     glória ou mudança de treinamento é aplicada às fichas oficiais das Casas.</p>
    <p>Glória proposta: Atacante {previewWarAftermath(battle).glory.attacker} ·
     Defensor {previewWarAftermath(battle).glory.defender}.</p>
    <div className="got-roster">
     {previewWarAftermath(battle).survivors.map(row=><div className="got-unit" key={row.unitId}>
      <strong>{row.unitName}</strong><span>Condição: {row.condition} · 1d6 = {row.die}
       · resultado ajustado {row.adjusted}</span>
      <span>Treinamento: {row.steps==='destroyed'?'proposta de destruição':
       row.steps===0?'inalterado':row.steps>0?'+'+row.steps+' graduação(ões)':
       row.steps+' graduação(ões)'}</span>
     </div>)}
    </div>
   </section>}
   <section className="battle-surface got-events" aria-label="Histórico de rolagens">
    <h3>Registro auditável da batalha</h3>
    <ol>{battle.events.slice(-18).map(event=><li key={event.seq}>
     <strong>#{event.seq} · R{event.round}</strong> {event.text}
     {event.roll&&<small> · Dados [{event.roll.join(', ')}]</small>}
    </li>)}</ol>
    <Button variant="outline" onClick={()=>setBattle(null)}>Nova simulação</Button>
   </section>
  </>}
  {error&&<p role="alert" className="got-error">{error}</p>}
 </section>;
}
