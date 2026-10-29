import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {ImagePicker,uploadImages,type PendingImage} from '@/components/campaign-content';
import type {Panel} from './panel-data';

export type MailLinks={origin:string;court:string;unit:string;role:string};
export type MailOptions={players:{id:string;name:string;houses:string[]}[];houses:{id:string;name:string;version:number|null;court:{id:string;name:string;role:string}[];units:{id:string;name:string;available:boolean}[]}[]};
export function useMailOptions(){
 return useQuery({queryKey:['mail-options'],queryFn:async()=>{const r=await supabase.rpc('mail_compose_options');if(r.error)throw r.error;return r.data as unknown as MailOptions;},staleTime:30000});
}
export const emptyLinks:MailLinks={origin:'',court:'',unit:'',role:'executor'};
export function MailLinkFields({value,onChange,options,onManage}:{value:MailLinks;onChange:(v:MailLinks)=>void;options:MailOptions;onManage?:(house:string)=>void}){
 const house=options.houses?.find(h=>h.id===value.origin);
 return <fieldset className="campaign-form"><legend>Vínculos da missiva</legend>
 <label>Casa remetente<select value={value.origin} onChange={e=>onChange({...emptyLinks,origin:e.target.value})}><option value="">Selecione a casa</option>{options.houses?.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
 <label>Membro da corte (opcional)<select value={value.court} onChange={e=>onChange({...value,court:e.target.value})}><option value="">Sem membro vinculado</option>{house?.court?.map(c=><option key={c.id} value={c.id}>{c.name} — {c.role}</option>)}{value.court&&!house?.court.some(c=>c.id===value.court)&&<option value={value.court}>Vínculo histórico indisponível — remova ou substitua</option>}</select></label>
 {value.court&&<label>Responsabilidade<select value={value.role} onChange={e=>onChange({...value,role:e.target.value})}><option value="executor">Executor</option><option value="order_recipient">Destinatário da ordem</option></select></label>}
 <label>Unidade militar (opcional)<select value={value.unit} onChange={e=>onChange({...value,unit:e.target.value})}><option value="">Sem unidade vinculada</option>{house?.units?.filter(u=>u.available).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}{value.unit&&!house?.units.some(u=>u.id===value.unit&&u.available)&&<option value={value.unit}>Unidade indisponível — remova ou substitua</option>}</select></label>
 {house&&(!house.court.length||!house.units.some(u=>u.available))&&<div role="status">{!house.court.length&&<p>Nenhum membro da corte disponível. Cadastre o personagem e vincule-o à Corte na ficha.</p>}{!house.units.some(u=>u.available)&&<p>Nenhuma unidade disponível. Cadastre uma unidade no Exército da ficha.</p>}{onManage&&<Button type="button" variant="outline" onClick={()=>onManage(house.id)}>Abrir ficha da casa</Button>}</div>}
 <p className="text-muted-foreground text-sm">Membro e unidade são opcionais. Os vínculos não executam ordens nem alteram o exército. A identificação privada só aparece a quem tem acesso à ficha.</p>
 </fieldset>;
}
type Draft={subject:string;content:string;targets:string[];links:MailLinks;week:string;images:PendingImage[]};
const drafts=new Map<string,Draft>();
export function replaceMailDraft(userId:string){const current=drafts.get(userId+':mail-compose');return !current||(!current.subject&&!current.content)||window.confirm('Substituir o texto da missiva ainda não enviada?');}
export function MailComposer({data,me,initial,onSave,onManage}:{data:Panel;me:Panel['players'][number]|undefined;initial?:{subject:string;content:string}|null;onSave:()=>void;onManage?:(house:string)=>void}){
 const {data:options,error,refetch}=useMailOptions();
 const scope=data.user.id+':mail-compose';
 const [draft,setDraft]=useState<Draft>(()=>initial?{subject:initial.subject,content:initial.content,targets:data.admin?[]:['narrator'],links:{...emptyLinks},week:'',images:[]}:drafts.get(scope)??{subject:'',content:'',targets:data.admin?[]:['narrator'],links:{...emptyLinks},week:'',images:[]});
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const key=useRef<string|null>(null);
 const change=(next:Draft)=>{setDraft(next);drafts.set(scope,next);};
 useEffect(()=>{if(options?.houses?.length===1&&!draft.links.origin)change({...draft,links:{...draft.links,origin:options.houses[0]!.id}});},[options]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{const d=drafts.get(scope);if(d?.content||d?.subject){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[scope]);
 const current=data.rounds.find(r=>r.status==='open')?.number??null;
 const suggested=(current??Math.max(0,...data.rounds.map(r=>r.number)))+1;
 const toggle=(id:string)=>change({...draft,targets:draft.targets.includes(id)?draft.targets.filter(t=>t!==id):[...draft.targets,id]});
 const search=query.toLocaleLowerCase('pt-BR');
 return <section id="nova-missiva"><h2>Escrever missiva</h2>
 <p>Selecione um ou mais destinatários. Cada entrega tem leitura e resposta próprias; as respostas não são compartilhadas entre os destinatários. O Narrador acompanha as missivas.</p>
 {error&&<p role="alert">Não foi possível carregar os cadastros. <Button type="button" variant="outline" onClick={()=>refetch()}>Tentar novamente</Button></p>}
 <form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');key.current??=crypto.randomUUID();try{
 const content=await uploadImages(draft.content,draft.images,key.current);
 const saving=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';
 const r=await supabase.rpc('send_linked_mail',{p_key:key.current,p_origin:draft.links.origin||null,p_targets:draft.targets,p_subject:draft.subject,p_content:content,p_court:draft.links.court||null,p_unit:draft.links.unit||null,p_role:draft.links.court?draft.links.role:null,p_draft:saving,p_week:data.admin?Number(draft.week||suggested):null});
 if(r.error)throw r.error;
 const result=r.data as unknown as {ids:string[];state:string;week:number|null;duplicate:boolean};
 setMessage(result.duplicate?'Envio já registrado; nenhuma cópia duplicada.':result.state==='draft'?'Rascunhos salvos.':result.state==='delivered'?`Missiva entregue a ${result.ids.length} destinatário(s).`:`Entrega programada para a Semana ${result.week}.`);
 key.current=null;drafts.delete(scope);setDraft({...draft,subject:'',content:'',images:[]});onSave();
 }catch(err){setMessage(err instanceof Error?err.message:typeof err==='object'&&err&&'message'in err?String(err.message):'Não foi possível salvar. Seu texto foi preservado.');}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="campaign-form"><legend>Destinatários ({draft.targets.length} selecionados)</legend>
 <label>Buscar destinatário<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {!data.admin&&<label><input type="checkbox" checked={draft.targets.includes('narrator')} onChange={()=>toggle('narrator')}/>Narrador</label>}
 {options?.players?.filter(p=>p.id!==me?.id&&p.name.toLocaleLowerCase('pt-BR').includes(search)).map(p=><label key={p.id}><input type="checkbox" checked={draft.targets.includes('p:'+p.id)} onChange={()=>toggle('p:'+p.id)}/>{p.name} {p.houses.length?('— '+p.houses.map(id=>data.houses.find(h=>h.id===id)?.name??id).join(', ')):''}</label>)}
 <details><summary>Enviar à casa inteira</summary>{data.houses.filter(h=>h.active&&h.season===2&&(data.admin||!data.members.some(m=>m.player_id===me?.id&&m.house_id===h.id))).map(h=><label key={h.id}><input type="checkbox" checked={draft.targets.includes('h:'+h.id)} onChange={()=>toggle('h:'+h.id)}/>Casa {h.name}</label>)}</details>
 </fieldset>
 <MailLinkFields value={draft.links} onChange={links=>change({...draft,links})} options={options??{players:[],houses:[]}} onManage={onManage}/>
 {data.admin&&<label>Semana de entrega<input type="number" min={1} value={draft.week} placeholder={String(suggested)} onChange={e=>change({...draft,week:e.target.value})}/></label>}
 <label>Assunto<input required value={draft.subject} onChange={e=>change({...draft,subject:e.target.value})}/></label>
 <label>Missiva<textarea required rows={10} value={draft.content} onChange={e=>change({...draft,content:e.target.value})}/></label>
 <ImagePicker images={draft.images} onChange={images=>change({...draft,images})} disabled={busy}/>
 <p>{data.admin?`Entrega prevista: Semana ${draft.week||suggested}.`:current?`Entrega na Semana ${current}.`:'Sem semana aberta. Você pode salvar rascunhos.'}</p>
 <div className="campaign-actions"><Button value="draft" variant="outline" disabled={busy||!draft.targets.length||(!data.admin&&!draft.links.origin)}>Salvar rascunho</Button><Button disabled={busy||!draft.targets.length||(!data.admin&&(!draft.links.origin||current===null))}>{busy?'Salvando…':data.admin?'Programar entrega':'Enviar missiva'}</Button></div>
 </form><p role="status">{message}</p></section>;
}
