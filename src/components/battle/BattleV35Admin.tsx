import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listSavedBattles} from '@/lib/battle/battle-session.functions';
import {listV35Cases,readV35Case,stageV35Case,saveV35Plan,
 approveV35Plan,applyV35Plan,type V35CaseRow,type V35CaseList}
 from '@/lib/battle/v3/official.functions';
import {BATTLE_V35_APPLY_UI_ENABLED} from '@/lib/battle/feature-flag';
import type {V35Source,V35Decision} from '@/lib/battle/v3/official-adjudication';

type Saved={id:string;name:string;status:string;state_version:number};
export function BattleV35Admin({onBack}:{onBack:()=>void}){
 const listBattles=useServerFn(listSavedBattles),listCases=useServerFn(listV35Cases);
 const read=useServerFn(readV35Case),stage=useServerFn(stageV35Case);
 const save=useServerFn(saveV35Plan),approve=useServerFn(approveV35Plan);
 const apply=useServerFn(applyV35Plan);
 const [battles,setBattles]=useState<Saved[]>([]);
 const [cases,setCases]=useState<V35CaseList[]>([]);
 const [selectedBattle,setSelectedBattle]=useState('');
 const [current,setCurrent]=useState<V35CaseRow|null>(null);
 const [decisions,setDecisions]=useState<V35Decision[]>([]);
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const operationId=useRef<string|null>(null);
 const refresh=async()=>{
  try{
   const [battleList,caseList]=await Promise.all([listBattles(),listCases()]);
   setBattles(battleList);setCases(caseList);
  }catch(e){setStatus(e instanceof Error?e.message:'Dados oficiais indisponíveis.');}
 };
 useEffect(()=>{void refresh();},[]);
 const open=async(id:string)=>{
  setBusy(true);setStatus('');
  try{
   const c=await read({data:{caseId:id}});
   setCurrent(c);operationId.current=null;
   const sources=c.sources_json as V35Source[];
   const known=Array.isArray(c.decisions_json)?c.decisions_json as V35Decision[]:[];
   setDecisions(sources.map(s=>known.find(v=>v.stackId===s.stackId)??{
    stackId:s.stackId,losses:0,note:'',
   }));
  }catch(e){setStatus(e instanceof Error?e.message:'Dossiê indisponível.');}
  finally{setBusy(false);}
 };
 const create=async()=>{
  if(!selectedBattle)return;
  setBusy(true);setStatus('');
  try{
   const response=await stage({data:{battleSessionId:selectedBattle}});
   await refresh();await open(response.caseId);
   setStatus('Dossiê aberto. Revise todas as baixas antes de aprovar.');
  }catch(e){setStatus(e instanceof Error?e.message:'A batalha não é elegível para homologação.');}
  finally{setBusy(false);}
 };
 const revise=(id:string,patch:Partial<V35Decision>)=>
  setDecisions(rows=>rows.map(d=>d.stackId===id?{...d,...patch}:d));
 const savePlan=async()=>{
  if(!current)return;
  setBusy(true);setStatus('');
  try{
   await save({data:{caseId:current.id,expectedReviewVersion:current.review_version,decisions}});
   await open(current.id);setStatus('Decisões manuais registradas e versionadas.');
  }catch(e){setStatus(e instanceof Error?e.message:'Decisões inválidas ou versão alterada.');}
  finally{setBusy(false);}
 };
 const approvePlan=async()=>{
  if(!current?.plan_hash)return;
  if(!window.confirm('Aprovar as decisões registradas? Após aprovar, a proposta ficará bloqueada.'))return;
  setBusy(true);setStatus('');
  try{
   await approve({data:{caseId:current.id,
    expectedReviewVersion:current.review_version,planHash:current.plan_hash,
    acknowledgement:'APROVAR BAIXAS'}});
   await open(current.id);setStatus('Dossiê aprovado. Nenhuma ficha foi alterada ainda.');
  }catch(e){setStatus(e instanceof Error?e.message:'Não foi possível aprovar o dossiê.');}
  finally{setBusy(false);}
 };
 const applyPlan=async()=>{
  if(!current||!BATTLE_V35_APPLY_UI_ENABLED)return;
  if(!window.confirm('Aplicar BAIXAS OFICIAIS nas DUAS casas agora? Esta ação afeta as fichas da campanha.'))return;
  operationId.current??=crypto.randomUUID();
  setBusy(true);setStatus('');
  try{
   await apply({data:{caseId:current.id,operationId:operationId.current,
    acknowledgement:'APLICAR NAS CASAS'}});
   await open(current.id);
   setStatus('Aplicação atômica confirmada nas duas fichas. Consulte o recibo de auditoria.');
  }catch(e){setStatus(e instanceof Error?e.message:'Aplicação não confirmada; confira o estado antes de repetir.');}
  finally{setBusy(false);}
 };
 const sources=current?.sources_json as V35Source[]|undefined;
 return <section className="battle-module crusade-mode" aria-label="Homologação oficial V3.5">
  <header className="battle-header crusade-masthead">
   <p className="battle-eyebrow">NARRADOR · ADJUDICAÇÃO</p>
   <h1>Homologação oficial de batalhas</h1>
   <p>Somente resultados PTE-2.0 com duas casas e unidades oficiais importadas.
    A Cruzada V3 fictícia jamais aplica baixas oficiais automaticamente.</p>
  </header>
  <div className="battle-surface">
   <h2>1. Escolher batalha oficial concluída</h2>
   <div className="battle-form-row">
    <label>Batalha salva
     <select aria-label="Batalha oficial a homologar" value={selectedBattle}
      onChange={e=>setSelectedBattle(e.target.value)}>
      <option value="">Selecione uma batalha</option>
      {battles.filter(b=>b.status==='completed').map(b=>
       <option key={b.id} value={b.id}>{b.name} · {b.id.slice(0,8)}</option>)}
     </select>
    </label>
    <Button disabled={!selectedBattle||busy} onClick={()=>void create()}>Abrir dossiê</Button>
    <Button variant="outline" onClick={()=>void refresh()}>Atualizar</Button>
    <Button variant="outline" onClick={onBack}>Voltar</Button>
   </div>
   <h3>Dossiês cadastrados</h3>
   {cases.length===0?<p>Sem dossiês oficiais nesta temporada.</p>:
    cases.map(c=><article className="battle-result-card" key={c.id}>
     <strong>{c.house_a_id} × {c.house_b_id}</strong>
     <p>Estado: {c.status} · Revisão {c.review_version}</p>
     <Button size="sm" variant="outline" disabled={busy} onClick={()=>void open(c.id)}>
      Abrir revisão</Button>
    </article>)}
  </div>
  {current&&sources&&<div className="battle-surface crusade-v35-review">
   <h2>2. Decidir baixas — dossiê {current.id.slice(0,8)}</h2>
   <p>Casas: <strong>{current.house_a_id}</strong> × <strong>{current.house_b_id}</strong>
    · Status: <strong>{current.status}</strong> · Revisão {current.review_version}</p>
   <p className="battle-note">Limite sugerido pelo motor: baixas táticas observadas.
    Digite explicitamente as perdas oficiais de cada unidade e uma justificativa.
    Nenhuma tabela de sobreviventes, XP, Poder ou evolução é aplicada automaticamente.</p>
   {sources.map(source=>{
    const row=decisions.find(d=>d.stackId===source.stackId);
    return <article key={source.stackId} className="crusade-v35-unit">
     <strong>{source.name}</strong>
     <p>{source.houseId} · {source.side==='attacker'?'Atacante':'Defensor'} ·
      Efetivo inicial {source.initialCount} · Baixas táticas {source.tacticalCasualties}</p>
     <div className="battle-form-row">
      <label>Baixas oficiais a aplicar
       <input aria-label={'Baixas oficiais '+source.name} type="number"
        min={0} max={source.tacticalCasualties} step={1} disabled={current.status!=='draft'}
        value={row?.losses??0} onChange={e=>revise(source.stackId,{
         losses:Number(e.target.value)})}/>
      </label>
      <label>Justificativa manual
       <input aria-label={'Justificativa '+source.name} type="text" maxLength={500}
        disabled={current.status!=='draft'} value={row?.note??''}
        onChange={e=>revise(source.stackId,{note:e.target.value})}/>
      </label>
     </div>
    </article>;
   })}
   <div className="crusade-v35-actions">
    {current.status==='draft'&&<>
     <Button disabled={busy} onClick={()=>void savePlan()}>Salvar decisões</Button>
     <Button variant="outline" disabled={busy||!current.plan_hash}
      onClick={()=>void approvePlan()}>Aprovar dossiê</Button>
    </>}
    {current.status==='approved'&&<>
     <p role="status">Aprovado. As fichas ainda não foram modificadas.</p>
     {BATTLE_V35_APPLY_UI_ENABLED?<Button disabled={busy} onClick={()=>void applyPlan()}>
      Aplicar oficialmente nas duas casas</Button>:
      <p className="battle-note">A aplicação ainda está bloqueada pelo servidor e pela interface
       até a autorização da política de baixas e a homologação.</p>}
    </>}
    {current.status==='applied'&&<p role="status">
     Resultado aplicado em {current.applied_at}. Recibo: {current.apply_id}</p>}
    <Button variant="outline" disabled={busy} onClick={()=>void open(current.id)}>Recarregar dossiê</Button>
   </div>
  </div>}
  {status&&<p role="status" className="battle-surface">{status}</p>}
 </section>;
}
