import {useEffect,useState} from 'react';
import {BattleV34Creator} from './BattleV34Creator';
import {BATTLE_V34_SYNC_UI_ENABLED} from '@/lib/battle/feature-flag';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listBattleSourceHouses} from '@/lib/battle/adapters/readonly-source.functions';
import {createV3Invitation,closeV3Invitation,listV3Invitations,
 type BattleV3Invitation} from '@/lib/battle/v3/invitations.functions';
import {MODEL_HOUSES} from '@/lib/battle/v3/model-houses';
import {V3_COMMANDERS,type CommanderId} from '@/lib/battle/v3/commanders';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import type {V3ScenarioOptions} from '@/lib/battle/v3/engine';
const defaults:V3ScenarioOptions={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon',defenderCommander:'ashkar-raider',
 scenario:'plain-open',opponent:'ai',
};
/** Apenas Narrador pode criar/revogar convocações. O servidor revalida o papel;
 * tabela de destinos tem RLS que impede a leitura cruzada entre jogadores. */
export function BattleV3InvitationCreator({onBack}:{onBack:()=>void}){
 const housesFn=useServerFn(listBattleSourceHouses);
 const listFn=useServerFn(listV3Invitations);
 const createFn=useServerFn(createV3Invitation);
 const closeFn=useServerFn(closeV3Invitation);
 const [houses,setHouses]=useState<{id:string;name:string}[]>([]);
 const [invitations,setInvitations]=useState<BattleV3Invitation[]>([]);
 const [options,setOptions]=useState<V3ScenarioOptions>(defaults);
 const [house,setHouse]=useState('');
 const [title,setTitle]=useState('Convocação de batalha experimental');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const update=(patch:Partial<V3ScenarioOptions>)=>setOptions(v=>({...v,...patch}));
 const refresh=async()=>{
  try{
   const [newHouses,open]=await Promise.all([housesFn(),listFn()]);
   setHouses(newHouses);setInvitations(open);
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível consultar convocações.');}
 };
 useEffect(()=>{void refresh();},[]);
 const create=async()=>{
  setBusy(true);setStatus('');
  try{
   await createFn({data:{
    title,houseId:house,
    scenario:options.scenario,attackerHouseId:options.attackerHouseId,
    defenderHouseId:options.defenderHouseId,
    attackerCommander:options.attackerCommander,defenderCommander:options.defenderCommander,
   }});
   setStatus('Convocação criada. O jogador autorizado verá o segundo botão na aba Batalha.');
   await refresh();
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível criar a convocação.');}
  finally{setBusy(false);}
 };
 const close=async(id:string)=>{
  if(!window.confirm('Encerrar esta convocação? O exercício local não será afetado.'))return;
  setBusy(true);
  try{await closeFn({data:{id}});setStatus('Convocação encerrada.');await refresh();}
  catch(e){setStatus(e instanceof Error?e.message:'Não foi possível encerrar convocação.');}
  finally{setBusy(false);}
 };
 return <section className="battle-module crusade-mode" aria-label="Convocar batalha pelo Narrador">
  <div className="battle-header crusade-masthead">
   <p className="battle-eyebrow">NARRADOR · COMANDO MILITAR</p><h1>Convocar batalha</h1>
   <p>O jogador recebe um convite somente na casa autorizada. O duelo usa casas-modelo e não altera fichas.</p>
  </div>
  <div className="battle-surface">
   <div className="battle-form-row">
    <label>Nome da convocação<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Casa destinatária<select value={house} onChange={e=>setHouse(e.target.value)}
      aria-label="Casa destinatária da convocação">
     <option value="">Escolher casa</option>
     {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
    </select></label>
   </div>
   <div className="crusade-model-grid">
    {(['attacker','defender'] as const).map(side=>{
      const modelKey=side==='attacker'?'attackerHouseId':'defenderHouseId';
      const generalKey=side==='attacker'?'attackerCommander':'defenderCommander';
      return <div key={side} className="crusade-side-card">
       <h3>{side==='attacker'?'Exército convocado':'Adversário modelo'}</h3>
       <label>Casa modelo<select value={options[modelKey]} onChange={e=>update({[modelKey]:e.target.value})}>
        {MODEL_HOUSES.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
       </select></label>
       <label>Comandante<select value={options[generalKey]}
         onChange={e=>update({[generalKey]:e.target.value as CommanderId})}>
        {V3_COMMANDERS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select></label>
      </div>;
    })}
   </div>
   <label>Cenário<select value={options.scenario} onChange={e=>update({scenario:e.target.value as BattleScenarioId})}>
    {Object.entries(SCENARIOS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
   </select></label>
   <div className="battle-home-actions">
    <Button disabled={!house||title.trim().length<5||busy} onClick={()=>void create()}>Criar convocação</Button>
    <Button variant="outline" onClick={onBack}>Voltar</Button>
   </div>
   {status&&<p role="status">{status}</p>}
  </div>
  <div className="battle-surface">
   <h2>Convocações ativas</h2>
   {invitations.length===0?<p>Nenhuma convocação de batalha ativa.</p>:
    invitations.map(i=><article key={i.id} className="battle-result-card">
     <strong>{i.title}</strong><p>Destino: {houses.find(h=>h.id===i.target_house_id)?.name??i.target_house_id}</p>
     <Button size="sm" variant="outline" disabled={busy} onClick={()=>void close(i.id)}>Encerrar convocação</Button>
    </article>)}
  </div>
  {BATTLE_V34_SYNC_UI_ENABLED&&<BattleV34Creator houses={houses} invitations={invitations}/>}
 </section>;
}
