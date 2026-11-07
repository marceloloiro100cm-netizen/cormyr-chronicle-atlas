import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {createWarBattle,issueWarOrder,advanceWarRound,warUnitSummary} from '@/lib/battle/got/engine';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import type {WarBattle,WarOrder,WarOrderKind,WarUnit,WarSide} from '@/lib/battle/got/types';
import type {WarWeather,WarVisibility,WarTerrainId,WarTerrainTile} from '@/lib/battle/got/terrain';
import {WAR_TERRAIN} from '@/lib/battle/got/terrain';
import type {WarFormation,WarFacing} from '@/lib/battle/got/formations';
import {WAR_FORMATIONS} from '@/lib/battle/got/formations';
import './battle-got.css';

type TypeId='infantry'|'archers'|'cavalry'|'garrison'|'raiders';
const OPTIONS:readonly {id:TypeId;label:string}[]=[
 {id:'infantry',label:'Infantaria'},{id:'archers',label:'Arqueiros'},
 {id:'cavalry',label:'Cavalaria'},{id:'garrison',label:'Guarnição'},
 {id:'raiders',label:'Saqueadores'},
];
const SIDE:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
const ORDER_LABEL:Record<WarOrderKind,string>={
 attack:'Atacar',charge:'Carga',defend:'Defender',move:'Mover',ready:'Prontidão',
 rally:'Reagrupar',revive:'Reanimar',reorganize:'Reorganizar',
 retreat:'Retirada', 'aggressive-retreat':'Retirada agressiva',
 formation:'Alterar formação',turn:'Girar',reverse:'Reverter',
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
 const [selected,setSelected]=useState('');
 const [target,setTarget]=useState('');
 const [kind,setKind]=useState<WarOrderKind>('attack');
 const [ranged,setRanged]=useState(false);
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
   setBattle(createWarBattle({id:'book-lab-'+seed,name,seed,width:12,height:7,
    units:prepared.map(row=>modelWarUnit({...row,training,typeId:types[row.id]??'infantry'})),
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
   const command:WarOrder={
    kind:legalKind,
    ...(['attack','charge','aggressive-retreat'].includes(legalKind)&&selectedTarget?{targetId:selectedTarget.id}:{}),
    ...(legalKind==='move'?{to:coord,sprint}:{}),
    ...(legalKind==='formation'?{formation}:{}),
    ...(legalKind==='turn'?{facing}:{}),
    ...(['attack','aggressive-retreat'].includes(legalKind)?{ranged}:{}),
   };
   const result=issueWarOrder(battle,{commanderId:commander.id,unitId:selectedUnit.id,order:command});
   setBattle(result.battle);setSelected('');setTarget('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Ordem não executada.');}
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
   dano e moral já pode ser testado; heróis, máquinas de cerco, terreno detalhado,
   formações avançadas e consequências narrativas ainda não estão completos.
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
   <label className="got-check"><input type="checkbox" checked={advanced}
    onChange={e=>setAdvanced(e.target.checked)}/> Usar formações e ângulo frontal (opcional no livro)</label>
   <p className="battle-note">O terreno pode ser ajustado no mapa após iniciar uma nova partida de treino.</p>
   <Button onClick={start}>Iniciar simulação pelo livro</Button>
  </section>:<>
   <section className="battle-surface got-status" aria-label="Estado da guerra" aria-live="polite">
    <h3>{battle.name}</h3>
    <p>Rodada <strong>{battle.round}</strong> · {battle.phase==='finished'?
     'Combate encerrado':<>Comanda agora: <strong>{SIDE[battle.turn]}</strong></>}
     {' '}· Iniciativa: {SIDE[battle.first]}</p>
    <p>Ordens restantes: {battle.commanders.map(c=>
     c.name+': '+(battle.ordersRemaining[c.id]??0)).join(' · ')}</p>
    {battle.phase==='finished'&&<p role="status"><strong>
     {battle.winner?'Vitória do '+SIDE[battle.winner]:'Confronto sem vencedor'}
    </strong></p>}
   </section>
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
       const terrain=tiles.find(t=>t.x===x&&t.y===y)?.terrain??'plain';
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
         .filter(([id])=>battle.advancedFormations||!['formation','turn','reverse'].includes(id))
         .map(([id,label])=><option key={id} value={id}>{label}</option>)}
       </select>
      </label>
      {['attack','charge','aggressive-retreat'].includes(legalKind)&&<>
       <label>Alvo
        <select aria-label="Alvo da ordem" value={selectedTarget?.id??''}
         onChange={e=>setTarget(e.target.value)}>
         {enemy.map(u=><option key={u.id} value={u.id}>{u.name} · {warUnitSummary(u).health}</option>)}
        </select>
       </label>
       {legalKind!=='charge'&&<label className="got-check">
        <input type="checkbox" checked={ranged} onChange={e=>setRanged(e.target.checked)}/>
        Usar Pontaria (quando houver arma à distância)</label>}
      </>}
      {battle.advancedFormations&&legalKind==='formation'&&<label>Formação
       <select value={formation} onChange={e=>setFormation(e.target.value as WarFormation)}>
        {Object.keys(WAR_FORMATIONS).map(id=><option key={id} value={id}>{id}</option>)}
       </select></label>}
      {battle.advancedFormations&&legalKind==='turn'&&<label>Direção
       <select value={facing} onChange={e=>setFacing(e.target.value as WarFacing)}>
        <option value="north">Norte</option><option value="east">Leste</option>
        <option value="south">Sul</option><option value="west">Oeste</option>
       </select></label>}
      {legalKind==='move'&&<>
       <label>Coluna X <input type="number" min={0} max={battle.width-1} value={coord.x}
        onChange={e=>setCoord(v=>({...v,x:Number(e.target.value)}))}/></label>
       <label>Linha Y <input type="number" min={0} max={battle.height-1} value={coord.y}
        onChange={e=>setCoord(v=>({...v,y:Number(e.target.value)}))}/></label>
       <label className="got-check"><input type="checkbox" checked={sprint}
        onChange={e=>setSprint(e.target.checked)}/> Correr (linha reta)</label>
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
