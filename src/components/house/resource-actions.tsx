import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {RESOURCE_KEYS,RESOURCE_NAMES,zeroResources,type HouseState,type Resource} from '@/lib/house/types';
import {previewLegacyCostReconciliation} from '@/lib/house/legacy-cost-reconciliation';

type Action='treasury_deposit'|'donate_gold'|'donate_glory'|'correct'|'reconcile_legacy_costs';
type Run=(action:Action,args:Record<string,unknown>,explanation?:string)=>Promise<boolean>;

export function HouseEconomyActions({state,admin,canEdit,busy,run}:{
 state:HouseState;admin:boolean;canEdit:boolean;busy:boolean;run:Run;
}){
 const [deposit,setDeposit]=useState(200),[depositSource,setDepositSource]=useState(''),
  [depositReason,setDepositReason]=useState(''),[goldPoints,setGoldPoints]=useState(1),
  [gloryResource,setGloryResource]=useState<Resource>('influence'),[gloryPoints,setGloryPoints]=useState(1),
  [character,setCharacter]=useState(''),[glorySource,setGlorySource]=useState(''),[gloryReason,setGloryReason]=useState('');
 return <section className="house-ledger"><h4>Cofre e doações da Casa</h4>
  <p><strong>Cofre de moedas:</strong> {(state.treasury??0).toLocaleString('pt-BR')} Dragões de Ouro (DO).</p>
  <p className="house-caption">Doar 200 DO do cofre concede +1 Riqueza permanente. As moedas precisam estar registradas antes da conversão.</p>
  {canEdit&&<form className="campaign-form" onSubmit={async e=>{e.preventDefault();await run('donate_gold',{points:goldPoints},`Doação de ${goldPoints*200} DO do cofre para +${goldPoints} Riqueza da Casa.`);}}>
   <label>Converter ouro do cofre em Riqueza (pontos)<input type="number" min={1} max={10000} step={1} value={goldPoints} onChange={e=>setGoldPoints(Number(e.target.value))}/></label>
   <Button disabled={busy||state.phase!=='active'||!Number.isInteger(goldPoints)||goldPoints<1||(state.treasury??0)<goldPoints*200}>
    Doar {goldPoints*200} DO → +{goldPoints} Riqueza</Button>
  </form>}
  {admin&&<details><summary>Registrar entrada de ouro — Narrador</summary>
   <form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(await run('treasury_deposit',{coins:deposit,source:depositSource},depositReason)){setDepositSource('');setDepositReason('');}}}>
    <label>Moedas verificadas (DO)<input type="number" min={1} max={1000000} step={1} value={deposit} onChange={e=>setDeposit(Number(e.target.value))}/></label>
    <label>Origem comprovada<input required minLength={6} value={depositSource} onChange={e=>setDepositSource(e.target.value)} placeholder="Inventário, recompensa, transferência…"/></label>
    <label>Justificativa do Narrador<textarea required minLength={10} value={depositReason} onChange={e=>setDepositReason(e.target.value)}/></label>
    <Button disabled={busy||depositReason.trim().length<10||depositSource.trim().length<6}>Creditar ouro auditado</Button>
   </form>
  </details>}
  {admin&&<details><summary>Doar Glória de personagem — aprovação do Narrador</summary>
   <p className="house-caption">1 Glória = +1 ponto permanente em um recurso. O Narrador deve conferir e registrar também o gasto na ficha individual do personagem.</p>
   <form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(await run('donate_glory',{character,source:glorySource,resource:gloryResource,points:gloryPoints},gloryReason)){setGloryReason('');}}}>
    <label>Personagem doador<input value={character} required minLength={2} onChange={e=>setCharacter(e.target.value)}/></label>
    <label>Glória doada (pontos)<input type="number" min={1} max={100} step={1} value={gloryPoints} onChange={e=>setGloryPoints(Number(e.target.value))}/></label>
    <label>Recurso beneficiado<select value={gloryResource} onChange={e=>setGloryResource(e.target.value as Resource)}>{RESOURCE_KEYS.map(r=><option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}</select></label>
    <label>Registro de origem da Glória<input value={glorySource} required minLength={8} onChange={e=>setGlorySource(e.target.value)}/></label>
    <label>Justificativa auditada<textarea value={gloryReason} required minLength={10} onChange={e=>setGloryReason(e.target.value)}/></label>
    <Button disabled={busy||state.phase!=='active'||character.trim().length<2||glorySource.trim().length<8||gloryReason.trim().length<10}>Confirmar doação de Glória</Button>
   </form>
  </details>}
 </section>;
}

export function AdminResourceCorrection({busy,run}:{busy:boolean;run:Run}){
 const [changes,setChanges]=useState(zeroResources()),[reason,setReason]=useState('');
 const changed=RESOURCE_KEYS.some(r=>changes[r]!==0);
 return <details className="house-ledger"><summary>Ajuste / Estorno Auditado de Recursos — Narrador</summary>
   <form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(await run('correct',{changes},reason.trim())){setChanges(zeroResources());setReason('');}}}>
    <p>Informe os deltas (positivos ou negativos), não os saldos finais. O histórico registrará o valor anterior e posterior sem substituir dados das posses ou tropas.</p>
    <div className="house-input-grid">{RESOURCE_KEYS.map(r=><label key={r}>{RESOURCE_NAMES[r]} (ajuste)
      <input type="number" step="any" value={changes[r]} onChange={e=>setChanges(v=>({...v,[r]:Number(e.target.value)}))}/>
    </label>)}</div>
    <label>Justificativa obrigatória<textarea required minLength={10} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explique o motivo do estorno ou da correção."/></label>
    <Button disabled={busy||!changed||reason.trim().length<10}>Registrar correção auditada</Button>
   </form>
 </details>;
}

export function AdminLegacyCostReconciliation({state,houseName,busy,run}:{
 state:HouseState;houseName:string;busy:boolean;run:Run;
}){
 const preview=previewLegacyCostReconciliation(state,houseName);
 const [selected,setSelected]=useState<string[]>(preview.issues.map(i=>i.id)),[reason,setReason]=useState('');
 if(!preview.issues.length)return null;
 return <details className="house-ledger"><summary>Conferir custos legados — item 16 ({preview.issues.length} pendência(s))</summary>
   <p>Ajustes propostos apenas para identificadores com custo e tipo histórico exatos. Não sobrescreve mudanças já feitas. Revise também o saldo disponível após o ajuste.</p>
   {preview.issues.map(i=><label key={i.id} className="campaign-check"><input type="checkbox" checked={selected.includes(i.id)}
     onChange={e=>setSelected(v=>e.target.checked?[...v,i.id]:v.filter(x=>x!==i.id))}/>{i.description}</label>)}
   <p className="house-caption">Prévia de TODOS os ajustes listados: {RESOURCE_KEYS.map(r=>`${RESOURCE_NAMES[r]} disponível ${preview.before.available[r]} → ${preview.after.available[r]}`).join(' · ')}</p>
   <label>Fonte/justificativa da conferência<textarea value={reason} minLength={10} onChange={e=>setReason(e.target.value)} placeholder="Origem das fichas e conferência de valores históricos"/></label>
   <Button disabled={busy||!selected.length||reason.trim().length<10} onClick={async()=>{if(await run('reconcile_legacy_costs',{ids:selected},reason.trim())){setReason('');setSelected([]);}}}>Aplicar somente os itens selecionados, com auditoria</Button>
 </details>;
}
