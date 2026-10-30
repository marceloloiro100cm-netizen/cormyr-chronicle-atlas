import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Save, Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrivateImage } from '@/components/campaign-content';
import { FOUNDATIONS, REGIONS } from '@/lib/house/regions';
import { HISTORY_TABLE, HISTORY_EFFECTS, historyAdjustments, memberBonusAdjustments } from '@/lib/house/creation-history';
import { RESOURCE_KEYS, RESOURCE_NAMES, type HouseState } from '@/lib/house/types';
export const CREATION_STEPS=['Identidade','Método','Fundação e história','Recursos','Domínios','Fortificações','Economia','Exército','Família','Revisão'];
export function Creation({state,admin,canEditAttributes,busy,onSave,onNavigate,onRoll,onCreationAction}:{state:HouseState;admin:boolean;canEditAttributes:boolean;busy:boolean;onSave:(args:Record<string,unknown>)=>Promise<boolean>;onNavigate:(section:string)=>void;onRoll:()=>Promise<boolean>;onCreationAction:(action:'foundation_roll'|'history_roll'|'member_bonus'|'crest_import',args?:Record<string,unknown>)=>Promise<boolean>}) {
  const [draft,setDraft]=useState(state),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(''),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [infrastructureA,setInfrastructureA]=useState<typeof RESOURCE_KEYS[number]>('defense');
  const [infrastructureB,setInfrastructureB]=useState<typeof RESOURCE_KEYS[number]>('wealth');
  const [bonusResource,setBonusResource]=useState<typeof RESOURCE_KEYS[number]>('influence');
  const [crestError,setCrestError]=useState('');
  const latest=useRef(draft),revision=useRef(0),savedRevision=useRef(0),inFlight=useRef<Promise<boolean>|null>(null);
  useEffect(()=>{if(revision.current===savedRevision.current){setDraft(state);latest.current=state;}},[state]);
  const update=(next:HouseState)=>{latest.current=next;revision.current++;setDraft(next);setDirty(true);setSaved('Rascunho alterado');};
  const flush=async():Promise<boolean>=>{
    if(timer.current)clearTimeout(timer.current);
    if(inFlight.current){if(!await inFlight.current)return false;}
    if(revision.current===savedRevision.current)return true;
    const d=latest.current,rev=revision.current;
    const request=onSave({base:d.base,identity:d.identity,creationStep:d.creationStep,method:d.method,budget:d.budget});inFlight.current=request;
    let ok=false;try{ok=await request;}finally{inFlight.current=null;}
    if(ok){savedRevision.current=rev;if(revision.current===rev){setDirty(false);setSaved('Rascunho salvo');}else return flush();}
    return ok;
  };
  useEffect(()=>{if(!dirty||state.phase!=='draft')return;timer.current=setTimeout(()=>{void flush();},1300);return()=>{if(timer.current)clearTimeout(timer.current);};},[dirty,draft,onSave,state.phase]);
  const step=draft.creationStep,locked=state.phase!=='draft';
  const doCreationAction=async(action:'foundation_roll'|'history_roll'|'member_bonus'|'crest_import',args:Record<string,unknown>={})=>{
    if(await flush())await onCreationAction(action,args);
  };
  const fresh=state.phase==='draft'&&state.rolls.length===0&&!state.importSources.length
   &&state.holdings.length===0&&!state.units.length&&RESOURCE_KEYS.every(r=>state.base[r]===0);
  const pointBudget=draft.budget??210;
  const pointSpent=RESOURCE_KEYS.reduce((n,r)=>n+draft.base[r],0);
  const onCrestSelected=async(file:File|undefined)=>{
   if(!file)return;
   setCrestError('');
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){
    setCrestError('Escolha PNG, JPEG ou WebP de até 2 MB.');return;
   }
   try{
    const base64=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');
      reader.onerror=()=>reject(new Error('Falha ao ler arquivo'));reader.readAsDataURL(file);
    });
    const success=await flush();
    if(success)await onCreationAction('crest_import',{base64,mime:file.type});
   }catch(e){setCrestError(e instanceof Error?e.message:'Não foi possível importar o brasão.');}
  };
  const creationHistory=draft.creationHistory;
  const historyBonus=historyAdjustments(draft),memberBonus=memberBonusAdjustments(draft);
  return <section className="house-panel"><p className="campaign-eyebrow">CRIAÇÃO · ETAPA {step+1} DE 10</p><h3>{CREATION_STEPS[step]}</h3><progress max={10} value={step+1} aria-label="Progresso da criação"/>
  {(state.phase==='draft'||admin)&&<div className="house-crest-import">
    <label>Importar imagem do brasão da Casa (PNG, JPEG ou WebP; até 2 MB)
     <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
       onChange={e=>void onCrestSelected(e.target.files?.[0])}/>
    </label>
    {state.identity.crestPath&&<div style={{maxWidth:170}}><PrivateImage path={state.identity.crestPath} caption="Brasão da Casa" thumbnail/></div>}
    {crestError&&<p role="alert">{crestError}</p>}
    <p className="house-caption">Imagem privada vinculada à Casa. Sem gerador de heráldica; o original existente é preservado.</p>
  </div>}
  <p role="status" className="house-caption">{saved||'Sua ficha atual permanece preservada até a conciliação.'}</p>
    {locked?<p className="house-warning">Criação {state.phase==='active'?'aprovada':'em revisão'}. Redistribuição bloqueada.</p>:<div className="campaign-form">
      {step===0&&<><label>Região<select value={draft.identity.region} onChange={e=>update({...draft,identity:{...draft.identity,region:e.target.value}})}><option value="">Selecione</option>{Object.entries(REGIONS).map(([id,r])=><option key={id} value={id}>{r.name}</option>)}</select></label><label>Lema<input value={draft.identity.motto} onChange={e=>update({...draft,identity:{...draft.identity,motto:e.target.value}})}/></label></>}
      {step===1&&<><label>Modo de criação
        <select disabled={!admin&&!fresh} value={draft.method} onChange={e=>{
          const method=e.target.value as HouseState['method'];
          if(method==='import'&&!admin)return;
          if(method==='budget'&&!admin&&!canEditAttributes)return;
          update({...draft,method,budget:method==='budget'?(draft.budget??210):null});
        }}>
         <option value="roll">Tradicional — 7d6 por recurso + bônus da região</option>
         <option value="budget" disabled={!admin&&!canEditAttributes}>Point buy — distribuir pontos-base livremente</option>
         {admin&&<option value="import">Importação de ficha histórica</option>}
        </select>
       </label>
       {draft.method==='budget'&&<div className="house-creation-budget">
         <p><strong>Point buy: {pointSpent} de {pointBudget} pontos-base utilizados</strong> · {pointBudget-pointSpent} disponíveis.</p>
         <p>O bônus regional é adicionado separadamente. As compras são feitas em proporção 1:1.</p>
         {!admin&&!canEditAttributes&&<p className="house-warning">A compra de pontos de atributos não está liberada pelo Narrador na Administração do jogador.</p>}
         {admin&&<label>Reserva de pontos-base (configuração do Narrador)
          <input type="number" min={0} value={draft.budget??210}
           onChange={e=>update({...draft,budget:Number(e.target.value)})}/>
         </label>}
       </div>}
       {draft.method==='roll'||(draft.method==='budget'&&draft.budget===null&&!draft.rolls.length&&!draft.importSources.length&&!canEditAttributes)?<>
        <p><Dice5 size={18}/> Sete dados por recurso, gerados no servidor e registrados uma única vez.</p>
        <Button disabled={busy||draft.rolls.length>0||draft.importSources.length>0||
         (!admin&&!(fresh||draft.method==='roll'))}
         onClick={async()=>{if(await flush())await onRoll();}}>
          {draft.rolls.length?'Rolagens já registradas':'Rolar recursos da Casa (7d6 cada)'}
        </Button>
        {draft.rolls.map((dice,i)=><p key={i}>{RESOURCE_NAMES[RESOURCE_KEYS[i]??'defense']}: {dice.join(' + ')} = {dice.reduce((a,b)=>a+b,0)}</p>)}
       </>:null}
      </>}
      {step===2&&<>
        <label>Fundação em CV<input type="number" value={draft.identity.foundation??''} onChange={e=>update({...draft,identity:{...draft.identity,foundation:e.target.value?Number(e.target.value):undefined}})}/></label>
        <details><summary>Tabela 6-3 · Fundação de Cormyr</summary>{FOUNDATIONS.map(f=><p key={f.roll}>{f.roll} · {f.name} · {f.year} CV · {f.era} · {f.events} eventos (mínimo 1)</p>)}</details>
        {!creationHistory&&draft.method!=='import'&&!draft.importSources.length&&
          <Button disabled={busy} onClick={()=>doCreationAction('foundation_roll')}>Rolar Fundação (1d6) e número de eventos (1d6)</Button>}
        {creationHistory&&<div className="house-creation-history">
          <p>Fundação: <strong>{creationHistory.foundationRoll} no 1d6</strong>. Eventos históricos previstos:
            <strong> {creationHistory.limit}</strong> (1d6: {creationHistory.eventCountRoll}).</p>
          {creationHistory.events.map((event,i)=><article key={event.id}>
            <strong>Evento {i+1}: {event.dice.join(' + ')} = {event.result} — {event.name}</strong>
            <p>{HISTORY_EFFECTS[event.result]}</p>
            <p>{RESOURCE_KEYS.filter(r=>event.changes[r]!==undefined).map(r=>
              `${RESOURCE_NAMES[r]} ${(event.changes[r]??0)>=0?'+':''}${event.changes[r]??0} [${(event.modifierDice[r]??[]).join(', ')}]`).join(' · ')}</p>
          </article>)}
          {!creationHistory.applied&&creationHistory.events.length<creationHistory.limit&&<>
            <p>Se o resultado for 11 (Infraestrutura), escolha previamente dois recursos distintos:</p>
            <div className="house-input-grid"><label>Primeiro recurso<select value={infrastructureA}
              onChange={e=>setInfrastructureA(e.target.value as typeof infrastructureA)}>
              {RESOURCE_KEYS.map(r=><option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}
            </select></label><label>Segundo recurso<select value={infrastructureB}
              onChange={e=>setInfrastructureB(e.target.value as typeof infrastructureB)}>
              {RESOURCE_KEYS.map(r=><option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}
            </select></label></div>
            <Button disabled={busy||infrastructureA===infrastructureB} onClick={()=>doCreationAction('history_roll',
              {infrastructure:[infrastructureA,infrastructureB]})}>Rolar evento {creationHistory.events.length+1} de {creationHistory.limit} (3d6)</Button>
          </>}
          {creationHistory.applied&&<p>Eventos consolidados na ficha ao enviar para revisão.</p>}
        </div>}
        <details><summary>Tabela 6-4 · Todos os eventos históricos e seus efeitos</summary>
          {Object.entries(HISTORY_TABLE).map(([number,name])=><p key={number}><strong>{number} — {name}</strong>: {HISTORY_EFFECTS[Number(number)]}</p>)}
        </details>
        <label>Histórico narrativo adicional (não altera recursos)<textarea value={draft.identity.history.join('\n')}
          onChange={e=>update({...draft,identity:{...draft.identity,history:e.target.value.split('\n').filter(v=>v.trim()&&!/^b[oô]nus$/i.test(v.trim()))}})}/></label>
        <p>Os efeitos mecânicos são calculados depois dos pontos-base e do bônus regional, com mínimo 0 após cada evento. Registros importados permanecem inalterados.</p>
      </>}
      {step===3&&<><p>Pontos-base do point buy, antes dos 70 pontos regionais. Em modo 7d6 ou importação, os atributos rolados ou importados não podem ser comprados novamente.</p><div className="house-input-grid">{RESOURCE_KEYS.map(r=><label key={r}>{RESOURCE_NAMES[r]}<input type="number" min={0} step="any" disabled={draft.method!=="budget"||(!admin&&!canEditAttributes)} value={draft.base[r]} onChange={e=>update({...draft,base:{...draft.base,[r]:Number(e.target.value)}})}/></label>)}</div>
        <h4>Bônus de criação por jogador (+1d6)</h4>
        <p>Cada jogador vinculado pode escolher um recurso e rolar uma única vez. A rolagem permanece no histórico auditável.</p>
        {(draft.creationBonuses??[]).map(b=><p key={b.playerId}>{RESOURCE_NAMES[b.resource]} +{b.die} (jogador {b.playerId})</p>)}
        {draft.method!=='import'&&!draft.importSources.length&&!draft.creationBonusesApplied&&!admin&&<div className="campaign-actions">
          <label>Recurso do bônus<select value={bonusResource} onChange={e=>setBonusResource(e.target.value as typeof bonusResource)}>
            {RESOURCE_KEYS.map(r=><option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}
          </select></label><Button disabled={busy} onClick={()=>doCreationAction('member_bonus',{resource:bonusResource})}>Aplicar meu bônus (+1d6)</Button>
        </div>}
        <p>Modificadores históricos: {RESOURCE_KEYS.map(r=>`${RESOURCE_NAMES[r]} ${historyBonus[r]>=0?'+':''}${historyBonus[r]}`).join(' · ')}</p>
        <p>Bônus pessoais: {RESOURCE_KEYS.filter(r=>memberBonus[r]).map(r=>`${RESOURCE_NAMES[r]} +${memberBonus[r]}`).join(' · ')||'Nenhum'}</p>
        </>}
      {step>=4&&step<=8&&<><p>{['','','','','Defina os terrenos e comunidades da casa.','Escolha fortificações e os locais que defendem.','Compare investimentos, requisitos e benefícios.','Organize tipos, treinamento e orçamento de XP.','Vincule a família e os especialistas aos NPCs existentes.'][step]}</p><Button disabled={busy} onClick={async()=>{if(await flush())onNavigate(['','','','','domains','fortifications','economy','army','court'][step]??'overview');}}>Gerenciar {CREATION_STEPS[step]}</Button></>}
      {step===9&&<><p>{state.domains.length} domínios · {state.holdings.length} posses · {state.units.length} unidades · {state.court.length} vínculos</p><p>A confirmação envia a criação para aprovação do Narrador. As fichas anteriores não serão apagadas.</p></>}
      <div className="campaign-actions"><Button variant="outline" disabled={busy||step===0} onClick={()=>update({...draft,creationStep:Math.max(0,step-1)})}><ArrowLeft size={16}/>Voltar</Button><Button disabled={busy} onClick={async()=>{update({...latest.current,creationStep:Math.min(9,step+1)});await flush();}}>{step===9?'Salvar revisão':'Salvar e continuar'}{step===9?<Save size={16}/>:<ArrowRight size={16}/>}</Button></div>
    </div>}
  </section>;
}
