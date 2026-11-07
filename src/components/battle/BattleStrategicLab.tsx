import {useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {STRATEGIC_SITES,STRATEGIC_ROADS,strategicRoute,
 startSiege,siegeLegalActions,siegeOrder,
 type SiegeState,type SiegeAction} from '@/lib/crusade/strategic-operations';
import './battle-strategy.css';

const LABELS:Record<SiegeAction,string>={
 BLOCKADE:'Bloquear suprimentos',BOMBARD:'Bombardear muralhas',
 ASSAULT:'Assaltar brecha',WITHDRAW:'Retirar tropas',
 REPAIR:'Reparar muralhas',SORTIE:'Executar sortida',
 RATION:'Racionar suprimentos',
};
export function BattleStrategicLab({onBack}:{onBack?:()=>void}){
 const [from,setFrom]=useState('arabel');
 const [to,setTo]=useState('hillmarch');
 const [siege,setSiege]=useState<SiegeState|null>(null);
 const [error,setError]=useState('');
 const route=useMemo(()=>strategicRoute(from,to),[from,to]);
 const roads=new Set(route.sites.slice(1).map((site,i)=>{
  const pair=[route.sites[i],site].sort();return pair.join('>');
 }));
 const action=(cmd:SiegeAction)=>{
  if(!siege)return;
  try{setSiege(siegeOrder(siege,cmd));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Ordem recusada.');}
 };
 return <section className="battle-module crusade-mode battle-strategy-lab"
  aria-label="Operações estratégicas e cercos de treinamento">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">CORMYR · CRUZADA AVANÇADA · P3</p>
   <h1>Mapa estratégico e cerco</h1>
   <p>Laboratório de logística e fortificações. Os custos de ligação são pontos fictícios
    de jogo; o cerco não modifica casas, soldados, recursos ou calendário.</p>
   {onBack&&<Button variant="outline" onClick={onBack}>Voltar ao módulo</Button>}
  </header>
  <div className="battle-strategy-layout">
   <section className="battle-surface" aria-label="Mapa das operações">
    <h2>Teatro de operações</h2>
    <div className="battle-form-row">
     <label>Origem<select aria-label="Origem estratégica" value={from}
      onChange={e=>setFrom(e.target.value)}>
      {STRATEGIC_SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select></label>
     <label>Destino<select aria-label="Destino estratégico" value={to}
      onChange={e=>setTo(e.target.value)}>
      {STRATEGIC_SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select></label>
    </div>
    <div className="battle-strategy-map" role="region" aria-label="Mapa operacional">
     <svg viewBox="0 0 100 100" role="img" aria-label="Rede de estradas e fortificações">
      <rect x="1" y="1" width="98" height="98" rx="6" fill="#302f2a"
       stroke="#bba77e" strokeWidth="0.6"/>
      {STRATEGIC_ROADS.map(r=>{
       const a=STRATEGIC_SITES.find(s=>s.id===r.from)!;
       const b=STRATEGIC_SITES.find(s=>s.id===r.to)!;
       const active=roads.has([r.from,r.to].sort().join('>'));
       return <g key={r.from+'-'+r.to}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
         stroke={active?'#dfbf70':'#7d785f'} strokeWidth={active?2.5:1}
         strokeDasharray={active?undefined:'1 1.5'}/>
        <text x={(a.x+b.x)/2} y={(a.y+b.y)/2-2} fill="#fff0c9"
         fontSize="3.3" textAnchor="middle">{r.cost}</text>
       </g>;
      })}
      {STRATEGIC_SITES.map(s=><g key={s.id}>
       <circle cx={s.x} cy={s.y} r={s.kind==='fort'?4.6:3.5}
        fill={s.id===to?'#ac5447':s.id===from?'#4c85ac':'#a39973'}
        stroke="#fff1cb" strokeWidth="0.8"/>
       <text x={s.x} y={s.y-7} fontSize="4" textAnchor="middle"
        fill="#ffeed0">{s.name}</text>
      </g>)}
     </svg>
    </div>
    <p>Rota: <strong>{route.sites.map(id=>STRATEGIC_SITES.find(s=>s.id===id)?.name).join(' → ')}</strong>
     {' '}· custo abstrato {route.cost} pontos.</p>
    <p className="battle-note">O mapa é um protótipo operacional de treinamento;
     não representa coordenadas, distâncias ou controle territorial oficial.</p>
   </section>
   <section className="battle-surface" aria-label="Simulação de cerco">
    <h2>Cerco por turnos</h2>
    {!siege?<div>
     <p>Escolha uma fortificação fictícia para iniciar o cerco.</p>
     <label>Alvo<select value={to} aria-label="Fortificação do cerco" onChange={e=>setTo(e.target.value)}>
      {STRATEGIC_SITES.filter(s=>s.kind==='fort').map(s=>
       <option key={s.id} value={s.id}>{s.name}</option>)}
      {STRATEGIC_SITES.find(s=>s.id===to)?.kind!=='fort'&&
       <option value={to} disabled>Selecione uma fortificação</option>}
     </select></label>
     <Button disabled={STRATEGIC_SITES.find(s=>s.id===to)?.kind!=='fort'}
      onClick={()=>{try{setSiege(startSiege(to));setError('');}
       catch(e){setError(e instanceof Error?e.message:'Cerco não autorizado.');}}}>
      Iniciar cerco fictício</Button>
    </div>:<>
     <div className="battle-strategy-stats">
      <p><strong>Dia {siege.day}</strong> · {siege.phase==='completed'?'Encerrado':
       siege.turn==='attacker'?'Turno atacante':'Turno defensor'}</p>
      <p>Integridade das muralhas <strong>{siege.wall}/100</strong></p>
      <meter min={0} max={100} value={siege.wall}/>
      <p>Forças sitiantes <strong>{siege.attacker}</strong> · guarnição <strong>{siege.garrison}</strong></p>
      <p>Suprimentos atacantes <strong>{siege.attackerSupply}</strong> · defensores <strong>{siege.defenderSupply}</strong></p>
      <p>Máquinas de cerco <strong>{siege.engines}</strong></p>
     </div>
     {siege.phase==='completed'?<p role="status">
      {siege.winner==='attacker'?'Vitória dos sitiantes':'Defensores resistiram'} · {siege.reason}.
     </p>:<div className="battle-strategy-actions" role="group" aria-label="Ordens legais de cerco">
      {siegeLegalActions(siege).map(cmd=><Button key={cmd} variant="outline"
       onClick={()=>action(cmd)}>{LABELS[cmd]}</Button>)}
     </div>}
     <Button variant="outline" onClick={()=>setSiege(null)}>Novo exercício</Button>
     <h3>Diário do cerco</h3>
     <ol aria-label="Histórico do cerco">
      {[...siege.history].reverse().map((event,i)=><li key={siege.history.length-i}>
       Dia {event.day} · {event.side==='attacker'?'Atacantes':'Defensores'} ·
       {' '}{event.text}. Muralha {event.wall}, guarnição {event.garrison}.
      </li>)}
     </ol>
    </>}
    {error&&<p role="alert">{error}</p>}
   </section>
  </div>
 </section>;
}
