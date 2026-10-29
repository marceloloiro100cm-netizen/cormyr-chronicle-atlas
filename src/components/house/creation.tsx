import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Save, Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FOUNDATIONS, REGIONS } from '@/lib/house/regions';
import { RESOURCE_KEYS, RESOURCE_NAMES, type HouseState } from '@/lib/house/types';
export const CREATION_STEPS=['Identidade','Método','Fundação e história','Recursos','Domínios','Fortificações','Economia','Exército','Família','Revisão'];
export function Creation({state,admin,busy,onSave,onNavigate,onRoll}:{state:HouseState;admin:boolean;busy:boolean;onSave:(args:Record<string,unknown>)=>Promise<boolean>;onNavigate:(section:string)=>void;onRoll:()=>Promise<boolean>}) {
  const [draft,setDraft]=useState(state),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(''),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
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
  return <section className="house-panel"><p className="campaign-eyebrow">CRIAÇÃO · ETAPA {step+1} DE 10</p><h3>{CREATION_STEPS[step]}</h3><progress max={10} value={step+1} aria-label="Progresso da criação"/><p role="status" className="house-caption">{saved||'Sua ficha atual permanece preservada até a conciliação.'}</p>
    {locked?<p className="house-warning">Criação {state.phase==='active'?'aprovada':'em revisão'}. Redistribuição bloqueada.</p>:<div className="campaign-form">
      {step===0&&<><label>Região<select value={draft.identity.region} onChange={e=>update({...draft,identity:{...draft.identity,region:e.target.value}})}><option value="">Selecione</option>{Object.entries(REGIONS).map(([id,r])=><option key={id} value={id}>{r.name}</option>)}</select></label><label>Lema<input value={draft.identity.motto} onChange={e=>update({...draft,identity:{...draft.identity,motto:e.target.value}})}/></label></>}
      {step===1&&<><label>Método<select disabled={!admin} value={draft.method} onChange={e=>update({...draft,method:e.target.value as HouseState['method']})}><option value="budget">Orçamento autorizado</option><option value="roll">Rolagens registradas do livro</option><option value="import">Importação conciliada</option></select></label><label>Orçamento de pontos-base<input type="number" min={0} step="any" disabled={!admin} value={draft.budget??''} placeholder="Definido pelo Narrador" onChange={e=>update({...draft,budget:e.target.value?Number(e.target.value):null})}/></label><p>{admin?'O orçamento não inclui os bônus da região.':'O Narrador controla o método e orçamento.'}</p>{draft.method==='roll'&&<><p><Dice5 size={18}/> Sete dados por recurso; valores registrados não mudam ao recarregar.</p>{admin&&<Button disabled={busy||state.rolls.length>0} onClick={()=>onRoll()}>Registrar rolagens de criação</Button>}{state.rolls.map((dice,i)=><p key={i}>{RESOURCE_NAMES[RESOURCE_KEYS[i]??'defense']}: {dice.join(' + ')} = {dice.reduce((a,b)=>a+b,0)}</p>)}</>}</>}
      {step===2&&<><label>Fundação em CV<input type="number" value={draft.identity.foundation??''} onChange={e=>update({...draft,identity:{...draft.identity,foundation:e.target.value?Number(e.target.value):undefined}})}/></label><details><summary>Adaptação de fundação de Cormyr</summary>{FOUNDATIONS.map(f=><p key={f.roll}>{f.roll} · {f.name} · {f.year} CV · {f.era} · {f.events} eventos (mínimo 1)</p>)}</details><label>Eventos históricos, um por linha<textarea value={draft.identity.history.join('\n')} onChange={e=>update({...draft,identity:{...draft.identity,history:e.target.value.split('\n').filter(v=>v.trim()&&!/^b[oô]nus$/i.test(v.trim()))}})}/></label></>}
      {step===3&&<><p>Pontos-base, antes do bônus da região. Importados não recebem bônus novamente.</p><div className="house-input-grid">{RESOURCE_KEYS.map(r=><label key={r}>{RESOURCE_NAMES[r]}<input type="number" min={0} step="any" disabled={draft.method!=="budget"} value={draft.base[r]} onChange={e=>update({...draft,base:{...draft.base,[r]:Number(e.target.value)}})}/></label>)}</div></>}
      {step>=4&&step<=8&&<><p>{['','','','','Defina os terrenos e comunidades da casa.','Escolha fortificações e os locais que defendem.','Compare investimentos, requisitos e benefícios.','Organize tipos, treinamento e orçamento de XP.','Vincule a família e os especialistas aos NPCs existentes.'][step]}</p><Button disabled={busy} onClick={async()=>{if(await flush())onNavigate(['','','','','domains','fortifications','economy','army','court'][step]??'overview');}}>Gerenciar {CREATION_STEPS[step]}</Button></>}
      {step===9&&<><p>{state.domains.length} domínios · {state.holdings.length} posses · {state.units.length} unidades · {state.court.length} vínculos</p><p>A confirmação envia a criação para aprovação do Narrador. As fichas anteriores não serão apagadas.</p></>}
      <div className="campaign-actions"><Button variant="outline" disabled={busy||step===0} onClick={()=>update({...draft,creationStep:Math.max(0,step-1)})}><ArrowLeft size={16}/>Voltar</Button><Button disabled={busy} onClick={async()=>{update({...latest.current,creationStep:Math.min(9,step+1)});await flush();}}>{step===9?'Salvar revisão':'Salvar e continuar'}{step===9?<Save size={16}/>:<ArrowRight size={16}/>}</Button></div>
    </div>}
  </section>;
}
