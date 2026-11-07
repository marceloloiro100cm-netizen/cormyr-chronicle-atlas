import './battle-cleanup.css';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {LAND_PROFILES,tacticalProfile} from '@/lib/battle/domain/profiles-v2';
import {makeFictionalStack,makeBattleSetup} from '@/lib/battle/domain/setup';
import {createScenario,SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {convertBattleMapGrid} from '@/lib/battle/geometry/map-conversion';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {hexKey} from '@/lib/battle/geometry/hex';
import type {BattleMap,BattleState,BattleStack,Hex,Side,Training} from '@/lib/battle/domain/types';
import {BattleBoard} from './BattleBoard';
import {BattleMapEditor} from './BattleMapEditor';
import {BattleSourcePicker} from './BattleSourcePicker';
import {BattleHouseVersus} from './BattleHouseHeraldry';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import {isBattleTrainingCopy,battleTrainingSourceKey} from '@/lib/battle/adapters/imported-npc-roster';

type PreparedUnit={id:string;side:Side;name:string;typeId:string;training:Training;count:number;position:Hex|null;imported?:BattleStack;importKey?:string};
const SIDE_LABEL={attacker:'Atacante',defender:'Defensor'} as const;
const DEFAULTS:PreparedUnit[]=[
 {id:'attacker-1',side:'attacker',name:'Infantaria atacante',typeId:'infantry',training:'trained',count:100,position:null},
 {id:'defender-1',side:'defender',name:'Infantaria defensora',typeId:'infantry',training:'trained',count:100,position:null},
];
const train:{id:Training;label:string}[]=[
 {id:'green',label:'Verde'},{id:'trained',label:'Treinada'},
 {id:'veteran',label:'Veterana'},{id:'elite',label:'Elite'},
];
export function BattleSetup({onStart,onBack}:{
 onStart:(state:BattleState,sideNames:Record<Side,string>,
  heraldry?:Partial<Record<Side,BattleHouseDirectoryRow>>)=>void;onBack:()=>void;
}){
 const [name,setName]=useState('Batalha experimental');
 const [sideNames,setSideNames]=useState<Record<Side,string>>({attacker:'Exército atacante',defender:'Exército defensor'});
 const [seed,setSeed]=useState('lab-pte2-2026');
 const [controls,setControls]=useState<Record<Side,'human'|'ai'>>({attacker:'human',defender:'human'});
 const [map,setMap]=useState<BattleMap>(()=>createScenario('plain-open',11,'square'));
 const [units,setUnits]=useState<PreparedUnit[]>(DEFAULTS);
 const [selected,setSelected]=useState('attacker-1');
 const [editor,setEditor]=useState(false);
 const [advanced,setAdvanced]=useState(false);
 const [quickOpponent,setQuickOpponent]=useState<'human'|'ai'>('ai');
 const [quickSource,setQuickSource]=useState<'models'|'houses'>('models');
 const [error,setError]=useState('');
 const [houseByUnitKey,setHouseByUnitKey]=useState<Record<string,BattleHouseDirectoryRow>>({});
 const onHouseLoaded=({house,stacks}:{
  side:Side;house:BattleHouseDirectoryRow;stacks:BattleStack[];
 })=>setHouseByUnitKey(before=>({...before,...Object.fromEntries(
  stacks.map(stack=>[battleTrainingSourceKey(stack),house]))}));
 const housesForSide=(side:Side)=>[...new Map(
  units.filter(u=>u.side===side&&u.imported).map(u=>{
   const house=houseByUnitKey[u.importKey??battleTrainingSourceKey(u.imported!)];
   return house?[house.id,house] as const:null;
  }).filter((entry):entry is readonly [string,BattleHouseDirectoryRow]=>Boolean(entry))
 ).values()];
 const primaryAttacker=housesForSide('attacker')[0];
 const primaryDefender=housesForSide('defender')[0];
 const heraldry:Partial<Record<Side,BattleHouseDirectoryRow>>={
  ...(primaryAttacker?{attacker:primaryAttacker}:{}),
  ...(primaryDefender?{defender:primaryDefender}:{}),
 };
 const displaySideNames:Record<Side,string>={
  attacker:housesForSide('attacker').length?
   housesForSide('attacker').map(h=>h.name).join(' + '):sideNames.attacker,
  defender:housesForSide('defender').length?
   housesForSide('defender').map(h=>h.name).join(' + '):sideNames.defender,
 };
 const update=(id:string,change:Partial<PreparedUnit>)=>setUnits(list=>list.map(u=>u.id===id?{...u,...change}:u));
 const makeId=(side:Side)=>side+'-'+crypto.randomUUID().slice(0,8);
 const effectiveUnits=(side:Side)=>units.filter(u=>u.side===side&&
  !(u.id===side+'-1'&&!u.imported));
 const remainingBySide={attacker:Math.max(0,5-effectiveUnits('attacker').length),
  defender:Math.max(0,5-effectiveUnits('defender').length)};
 const addImportedMany=(stacks:BattleStack[],houseName:string):boolean=>{
  if(stacks.length===0)return false;
  const side=stacks[0]!.side;
  if(stacks.some(source=>source.side!==side||!isBattleTrainingCopy(source))){
   setError('Somente cópias militares do mesmo exército podem ser importadas.');return false;
  }
  const current=units.filter(u=>!(u.side===side&&u.id===side+'-1'&&!u.imported));
  if(current.filter(u=>u.side===side).length+stacks.length>5){
   setError('Limite de cinco agrupamentos por lado.');return false;
  }
  const keys=[...current.filter(u=>u.imported).map(u=>
   u.importKey??battleTrainingSourceKey(u.imported!)),
   ...stacks.map(battleTrainingSourceKey)];
  if(new Set(keys).size!==keys.length){
   setError('Uma ou mais unidades desta Casa já foram copiadas.');return false;
  }
  const prepared=stacks.map(source=>{
   const id='src-'+crypto.randomUUID();
   const imported={...source,id};
   return {id,side,name:source.name,typeId:source.primaryTypeId,
    training:source.training,count:source.initialCount,position:null,imported,
    importKey:battleTrainingSourceKey(source)};
  });
  setUnits([...current,...prepared]);
  setSelected(prepared[0]!.id);
  setSideNames(before=>({...before,
   [side]:before[side]==='Exército '+(side==='attacker'?'atacante':'defensor')?
    'Casa '+houseName:before[side]}));
  setError('');
  return true;
 };
 const addImported=(source:BattleStack,houseName:string)=>
  addImportedMany([source],houseName);
 const add=(side:Side)=>{
  if(units.filter(u=>u.side===side).length>=5){setError('Limite de 5 agrupamentos por lado.');return;}
  const id=makeId(side);
  setUnits(list=>[...list,{id,side,name:'Nova unidade',typeId:'infantry',training:'green',count:100,position:null}]);
  setSelected(id);setError('');
 };
 const place=(hex:Hex)=>{
  const unit=units.find(u=>u.id===selected);
  if(!unit){setError('Selecione uma unidade antes de posicionar.');return;}
  const key=hexKey(hex);
  if(!map.deployment[unit.side].some(h=>hexKey(h)===key)){
    setError('Selecione um célula da zona do '+SIDE_LABEL[unit.side]+'.');return;
  }
  if(map.tiles.find(t=>hexKey(t)===key)?.terrain==='rock'){setError('Rocha intransponível.');return;}
  if(units.some(other=>other.id!==unit.id&&other.position&&hexKey(other.position)===key)){
    setError('Este célula já está ocupado.');return;
  }
  update(selected,{position:hex});setError('');
 };
 const automatic=()=>{
  const occupied=new Set<string>();
  const next=units.map(u=>{
   const pos=map.deployment[u.side].find(h=>
     map.tiles.find(t=>hexKey(t)===hexKey(h))?.terrain!=='rock'&&!occupied.has(hexKey(h)));
   if(!pos)return {...u,position:null};
   occupied.add(hexKey(pos));return {...u,position:pos};
  });
  setUnits(next);
  setError(next.some(u=>!u.position)?'Não há vagas legais para posicionar todas as unidades.':'');
 };
 const start=()=>{
  try{
   const stacks=units.map(u=>{
     if(!u.position)throw new Error('Posicione todas as unidades antes de iniciar.');
     if(u.imported)return {...u.imported,position:u.position,side:u.side};
     return makeFictionalStack({id:u.id,side:u.side,name:u.name,typeId:u.typeId,
       training:u.training,count:u.count,position:u.position});
   });
   const state=makeBattleSetup({id:'lab-'+seed,name,seed,map,
     controls,stacks});
   if(!sideNames.attacker.trim()||!sideNames.defender.trim())throw new Error('Nomeie os dois exércitos.');
   onStart(state,displaySideNames,heraldry);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar a batalha.');}
 };
 const quickStart=()=>{
  try{
   if(!name.trim()||!seed.trim())throw new Error('Informe um nome e uma semente válidos.');
   const errors=validateBattleMap(map);
   if(errors.length>0)throw new Error('Mapa inválido: '+errors.join('; '));
   const occupied=new Set<string>();
   const prepared=quickSource==='houses'?units:DEFAULTS;
   if(quickSource==='houses'&&!prepared.some(u=>u.imported))
    throw new Error('Escolha uma Região, uma Casa e carregue suas unidades antes de iniciar.');
   const stacks=prepared.map(u=>{
    const position=map.deployment[u.side].find(h=>!occupied.has(hexKey(h))&&
     map.tiles.find(tile=>hexKey(tile)===hexKey(h))?.terrain!=='rock');
    if(!position)throw new Error('O cenário não possui espaços legais para os dois exércitos.');
    occupied.add(hexKey(position));
    return u.imported?{...u.imported,position,side:u.side}:
     makeFictionalStack({id:u.id,side:u.side,name:u.name,typeId:u.typeId,
      training:u.training,count:u.count,position});
   });
   const battle=makeBattleSetup({id:'lab-'+seed,name,seed,map,
    controls:{attacker:'human',defender:quickOpponent},stacks});
   setError('');onStart(battle,displaySideNames,heraldry);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar o confronto.');}
 };
 const mapErrors=validateBattleMap(map);
 const positioned=units.filter(u=>u.position).length;
 return <div className="battle-setup battle-heraldry-mode">
  <div className="battle-heading"><div><h2>Preparar batalha</h2><p>Laboratório de tropas fictícias — nenhuma baixa altera fichas de casas.</p></div>
    <Button variant="outline" onClick={onBack}>Voltar ao painel</Button></div>
  {!advanced&&<section className="battle-surface battle-quick-start" aria-label="Começar batalha simples">
   <h3>Configuração rápida</h3>
   <p>Inicie com uma infantaria-modelo de cada lado, posicionada automaticamente no mapa.
    Para escolher as unidades, alterar os efetivos e pintar o terreno, use a configuração completa.</p>
   <div className="battle-source-toggle" role="group" aria-label="Origem dos exércitos">
    <Button variant={quickSource==='models'?'default':'outline'} aria-pressed={quickSource==='models'}
     onClick={()=>setQuickSource('models')}>Forças-modelo</Button>
    <Button variant={quickSource==='houses'?'default':'outline'} aria-pressed={quickSource==='houses'}
     onClick={()=>setQuickSource('houses')}>Casas cadastradas · Região e Casa</Button>
   </div>
   <div className="battle-form-row">
    <label>Nome do confronto<input aria-label="Nome do confronto rápido" maxLength={120}
     value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Formato do mapa<select aria-label="Formato da malha PTE"
      value="square" onChange={e=>{
       const id=Object.hasOwn(SCENARIOS,map.id)?map.id as BattleScenarioId:'plain-open';
       try{setMap(convertBattleMapGrid(map,'square'));}catch(cause){
        setError(cause instanceof Error?cause.message:'Conversão de malha recusada.');return;
       }
       setUnits(list=>list.map(u=>({...u,position:null})));setError('');
      }}>
      <option value="square">Quadrados (novo padrão)</option>
      {/* Mapas hexagonais históricos só podem ser lidos de replays antigos. */}
     </select></label>
     <label>Campo de batalha<select aria-label="Cenário rápido" value={map.id}
     onChange={e=>{const id=e.target.value as BattleScenarioId;
      if(Object.hasOwn(SCENARIOS,id))setMap(createScenario(id,map.width,'square'));}}>
     {!Object.hasOwn(SCENARIOS,map.id)&&<option value={map.id}>Mapa personalizado</option>}
     {Object.entries(SCENARIOS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
    <label>Adversário<select aria-label="Adversário rápido" value={quickOpponent}
     onChange={e=>setQuickOpponent(e.target.value as 'human'|'ai')}>
     <option value="ai">Inteligência artificial</option>
     <option value="human">Narrador controla os dois lados</option>
    </select></label>
   </div>
   {quickSource==='houses'&&<div className="battle-source-quick" aria-label="Selecionar casas e exércitos">
    <BattleSourcePicker onAdd={addImported} onAddMany={addImportedMany}
     onHouseLoaded={onHouseLoaded} remainingBySide={remainingBySide}/>
    <BattleHouseVersus houses={heraldry} names={displaySideNames}/>
    <p className="battle-note">
     {units.filter(u=>u.imported).length} unidades documentadas copiadas para este exercício.
     Exércitos sem Casa selecionada continuam com tropas-modelo.</p>
   </div>}
   {error&&<p role="alert" className="battle-error">{error}</p>}
   <div className="battle-home-actions">
    <Button disabled={Boolean(mapErrors.length)||!name.trim()||
     (quickSource==='houses'&&!units.some(u=>u.imported))} onClick={quickStart}>
     {quickSource==='houses'?'Iniciar batalha com unidades das casas':'Iniciar combate com forças-modelo'}</Button>
    <Button variant="outline" onClick={()=>{setAdvanced(true);setError('');}}>
     Personalizar unidades e mapa</Button>
   </div>
   <p className="battle-note">Você pode terminar o exercício e repetir a batalha.
    Nenhum exército oficial será alterado.</p>
  </section>}
  {advanced&&<>
   <div className="battle-advanced-back">
    <Button variant="outline" onClick={()=>{setAdvanced(false);setError('');}}>
     Voltar à configuração rápida</Button>
    <p>Montagem detalhada · cinco etapas</p>
   </div>
  <section className="battle-surface" aria-label="Identificação da batalha">
    <h3>1. Identificação</h3>
    <div className="battle-form-row">
     <label>Nome da batalha<input aria-label="Nome da batalha" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Semente de simulação<input aria-label="Semente de simulação" maxLength={128} value={seed} onChange={e=>setSeed(e.target.value)}/></label>
    </div>
    <div className="battle-form-row">{(['attacker','defender'] as const).map(side=><label key={side}>
      Controle de {SIDE_LABEL[side]}
      <select aria-label={'Controle de '+SIDE_LABEL[side]} value={controls[side]}
        onChange={e=>setControls(x=>({...x,[side]:e.target.value as 'human'|'ai'}))}>
        <option value="human">Narrador</option><option value="ai">Inteligência artificial</option>
      </select>
     </label>)}</div>
    <p className="battle-note">IA heurística determinística, sem dados externos. Regras PTE-2.0 experimentais.</p>
  </section>
  <section className="battle-surface" aria-label="Exércitos fictícios">
   <h3>2. Exércitos</h3>
   <div className="battle-army-grid">
   {(['attacker','defender'] as const).map(side=><fieldset key={side} className="battle-army">
    <legend>{SIDE_LABEL[side]}</legend>
    <label>Nome do exército<input aria-label={'Nome do exército '+SIDE_LABEL[side]} maxLength={90}
      value={sideNames[side]} onChange={e=>setSideNames(x=>({...x,[side]:e.target.value}))}/></label>
    {units.filter(u=>u.side===side).map(u=><article className="battle-roster-card" key={u.id}>
      <button type="button" className={selected===u.id?'battle-roster-choice active':'battle-roster-choice'}
        aria-pressed={selected===u.id} onClick={()=>setSelected(u.id)}>
        {u.name||'Sem nome'} {u.position?'· Posicionada':'· Sem posição'}
      </button>
      <label>Nome da unidade<input aria-label={'Nome da unidade '+u.id} maxLength={120} disabled={Boolean(u.imported)} value={u.name}
        onChange={e=>update(u.id,{name:e.target.value})}/></label>
      <div className="battle-form-row">
       <label>Tipo<select disabled={Boolean(u.imported)} aria-label={'Tipo da unidade '+u.id} value={u.typeId}
         onChange={e=>{
          const typeId=e.target.value;tacticalProfile(typeId);
          update(u.id,{typeId,count:typeId==='cavalry'?20:100});
         }}>
         {LAND_PROFILES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
         <option value="warships" disabled>Navios de guerra · indisponível em terra</option>
       </select></label>
       <label>Treino<select disabled={Boolean(u.imported)} aria-label={'Treinamento '+u.id} value={u.training}
         onChange={e=>update(u.id,{training:e.target.value as Training})}>
         {train.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
       </select></label>
       <label>Efetivo<input type="number" min="1" max="1000" step="1"
        aria-label={'Efetivo '+u.id} disabled={Boolean(u.imported)} value={u.count} onChange={e=>update(u.id,{count:Number(e.target.value)})}/></label>
      </div>
      {u.imported&&<details><summary>Origem oficial · diagnóstico</summary>
        <p>Casa {u.imported.source.houseId} · versão {u.imported.source.sourceVersion};
          PV táticos calculados separadamente.</p>
        {(u.imported.source.warnings??[]).map((w,i)=><p key={i}>{w}</p>)}
       </details>}
      <div className="battle-roster-actions">
       <Button size="sm" variant="outline" onClick={()=>setSelected(u.id)}>Implantar</Button>
       <Button size="sm" variant="outline" disabled={units.filter(x=>x.side===side).length<=1}
        onClick={()=>{setUnits(list=>list.filter(x=>x.id!==u.id));if(selected===u.id)setSelected(units.find(x=>x.id!==u.id)?.id??'');}}>
        Remover</Button>
      </div>
     </article>)}
    <Button variant="outline" disabled={units.filter(u=>u.side===side).length>=5} onClick={()=>add(side)}>Adicionar unidade</Button>
   </fieldset>)}
   </div>
  </section>
  <BattleSourcePicker onAdd={addImported} onAddMany={addImportedMany}
   onHouseLoaded={onHouseLoaded} remainingBySide={remainingBySide}/>
  <BattleHouseVersus houses={heraldry} names={displaySideNames}/>
  <section className="battle-surface" aria-label="Escolha do terreno">
   <h3>3. Terreno</h3>
   <div className="battle-form-row">
     <label>Formato do mapa<select aria-label="Formato da malha PTE"
      value="square" onChange={e=>{
       const id=Object.hasOwn(SCENARIOS,map.id)?map.id as BattleScenarioId:'plain-open';
       try{setMap(convertBattleMapGrid(map,'square'));}catch(cause){
        setError(cause instanceof Error?cause.message:'Conversão de malha recusada.');return;
       }
       setUnits(list=>list.map(u=>({...u,position:null})));setError('');
      }}>
      <option value="square">Quadrados (novo padrão)</option>
      {/* Mapas hexagonais históricos só podem ser lidos de replays antigos. */}
     </select></label>
      <label>Cenário<select aria-label="Escolher cenário" value={Object.hasOwn(SCENARIOS,map.id)?map.id:'custom'}
      onChange={e=>{const id=e.target.value as BattleScenarioId;if(Object.hasOwn(SCENARIOS,id)){setMap(createScenario(id,map.width,'square'));setUnits(x=>x.map(u=>({...u,position:null})));setError('');}}}>
      {!Object.hasOwn(SCENARIOS,map.id)&&<option value="custom">Personalizado</option>}
      {Object.entries(SCENARIOS).map(([id,label])=><option value={id} key={id}>{label}</option>)}
     </select></label>
     <Button variant="outline" onClick={()=>setEditor(x=>!x)}>{editor?'Fechar editor':'Abrir editor de mapa'}</Button>
   </div>
   {editor&&<BattleMapEditor map={map} onChange={next=>{
     setMap(next);setUnits(list=>list.map(u=>({...u,position:null})));setError('');
   }}/>}
   {mapErrors.length>0&&<p role="alert">Mapa inválido: {mapErrors.join('; ')}</p>}
  </section>
  <section className="battle-surface" aria-label="Implantação das unidades">
   <h3>4. Implantação</h3>
   <p>Selecione uma unidade no exército e toque na célula de sua zona. Vermelho: atacante; azul: defensor.</p>
   <p role="status">{positioned} / {units.length} agrupamentos posicionados.</p>
   <div className="battle-form-row">
    <label>Unidade selecionada<select aria-label="Unidade para implantar" value={selected}
      onChange={e=>setSelected(e.target.value)}>
      {units.map(u=><option key={u.id} value={u.id}>{SIDE_LABEL[u.side]} · {u.name}</option>)}
    </select></label>
    <Button variant="outline" onClick={automatic}>Posicionar automaticamente</Button>
   </div>
   <BattleBoard map={map} showZones stacks={units.filter(u=>u.position).map(u=>{
     const p=tacticalProfile(u.typeId);
     return {id:u.id,side:u.side,name:u.name,position:u.position!,primaryTypeId:u.typeId,
       initialCount:u.count,hpPerSoldier:p.hpPerSoldier,currentHp:u.count*p.hpPerSoldier,moraleState:'steady' as const};
   })} selectedId={selected} onHexClick={place}/>
  </section>
  <section className="battle-surface" aria-label="Revisão e início">
   <h3>5. Revisão</h3>
   <p>{sideNames.attacker} × {sideNames.defender}; {units.length} agrupamentos, {positioned} posicionados;
     arena {map.width} × {map.height}; perfil PTE-2.0 experimental.</p>
   <p className="battle-note">A partida roda apenas na memória desta aba. Navegar ou recarregar pode perder a simulação.</p>
   {error&&<p role="alert" className="battle-error">{error}</p>}
   <Button disabled={mapErrors.length>0||units.some(u=>!u.position)||!name.trim()||!seed.trim()}
     onClick={start}>Iniciar batalha</Button>
  </section>
  </>}
 </div>;
}
