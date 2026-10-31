import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import type {Json} from '@/integrations/supabase/types';

type Person={id:string;display_name:string;house_id:string|null;is_noble:boolean;
 birth_year:number|null;birth_date?:string|null;
 baseline_age:number|null;baseline_year:number|null;
 alive_status:string;death_year:number|null;death_date?:string|null;
 aliases?:string[];noble_roles?:string[];race?:string|null;
 age_policy?:string;age_exception_note?:string|null;apparent_age?:string|null;
 visibility?:string;owner_user_id?:string|null;confidence?:string;review_note?:string;
 review_status:string;version:number};
type Candidate={id:string;source_kind:string;source_key:string;proposed_name:string;
 house_id:string|null;claimed_birth_year:number|null;claimed_age:number|null;status:string};
type Relation={id:string;from_character:string;to_character:string;relation:string};
type Registry={characters:Person[];pending:Candidate[];pending_total:number;
 count:number;relations:Relation[];links:{character_id:string}[]};
const errMsg=(e:unknown)=>e instanceof Error?e.message:
 e&&typeof e==='object'&&'message' in e?String(e.message):'Falha no registro.';
const optNumber=(s:string)=>s.trim()===''?null:Number(s);
export function NarratorCharacterRegistry(){
 const qc=useQueryClient();
 const registry=useQuery({queryKey:['noble-character-registry'],queryFn:async()=>{
  const r=await supabase.rpc('get_character_registry_hub',{p_limit:300});
  if(r.error)throw r.error;return r.data as unknown as Registry;
 },refetchInterval:30000});
 const [filter,setFilter]=useState(''),[reason,setReason]=useState('');
 const [name,setName]=useState(''),[house,setHouse]=useState('');
 const [birth,setBirth]=useState(''),[baseAge,setBaseAge]=useState('');
 const [baseYear,setBaseYear]=useState(''),[death,setDeath]=useState('');
 const [alive,setAlive]=useState('unknown'),[isNoble,setIsNoble]=useState(true);
 const [aliases,setAliases]=useState(''),[roles,setRoles]=useState(''),[race,setRace]=useState('');
 const [birthDate,setBirthDate]=useState(''),[deathDate,setDeathDate]=useState('');
 const [agePolicy,setAgePolicy]=useState('year_turn'),[exceptionNote,setExceptionNote]=useState('');
 const [apparentAge,setApparentAge]=useState(''),[visibility,setVisibility]=useState('gm');
 const [ownerId,setOwnerId]=useState(''),[confidence,setConfidence]=useState('unverified');
 const [reviewStatus,setReviewStatus]=useState('pending'),[reviewNote,setReviewNote]=useState('');
 const [personId,setPersonId]=useState<string|null>(null);
 const [candidate,setCandidate]=useState<Candidate|null>(null);
 const [target,setTarget]=useState(''),[action,setAction]=useState('link');
 const [manifest,setManifest]=useState('');
 const [fromId,setFromId]=useState(''),[toId,setToId]=useState(''),[relation,setRelation]=useState('parent');
 const [message,setMessage]=useState(''),[isError,setIsError]=useState(false),[busy,setBusy]=useState(false);
 const data=registry.data;
 const selectedPerson=data?.characters.find(p=>p.id===personId);
 const submit=async(fn:()=>Promise<string>)=>{
  if(busy)return;setBusy(true);setIsError(false);setMessage('');
  try{const result=await fn();setMessage(result);await qc.invalidateQueries({queryKey:['noble-character-registry']});}
  catch(e){setIsError(true);setMessage(errMsg(e));}
  finally{setBusy(false);}
 };
 const choose=(p:Person)=>{
  setPersonId(p.id);setTarget(p.id);setName(p.display_name);setHouse(p.house_id??'');
  setBirth(String(p.birth_year??''));setBaseAge(String(p.baseline_age??''));
  setBaseYear(String(p.baseline_year??''));setDeath(String(p.death_year??''));
  setAlive(p.alive_status);setIsNoble(p.is_noble);
  setAliases((p.aliases??[]).join(', '));setRoles((p.noble_roles??[]).join(', '));setRace(p.race??'');
  setBirthDate(p.birth_date??'');setDeathDate(p.death_date??'');
  setAgePolicy(p.age_policy??'year_turn');setExceptionNote(p.age_exception_note??'');
  setApparentAge(p.apparent_age??'');setVisibility(p.visibility??'gm');
  setOwnerId(p.owner_user_id??'');setConfidence(p.confidence??'unverified');
  setReviewStatus(p.review_status);setReviewNote(p.review_note??'');
 };
 const newPerson=()=>{setPersonId(null);setTarget('');setName('');setHouse('');
  setBirth('');setBaseAge('');setBaseYear('');setDeath('');
  setAlive('unknown');setIsNoble(true);setCandidate(null);
  setAliases('');setRoles('');setRace('');setBirthDate('');setDeathDate('');
  setAgePolicy('year_turn');setExceptionNote('');setApparentAge('');
  setVisibility('gm');setOwnerId('');setConfidence('unverified');
  setReviewStatus('pending');setReviewNote('');};
 if(registry.isPending)return <section id="temporal-genealogias" className="narrator-calendar-panel"><h3>Nobres e genealogias</h3><p role="status">Carregando registro canônico…</p></section>;
 if(!data||registry.error)return <section id="temporal-genealogias" className="narrator-calendar-panel"><h3>Nobres e genealogias</h3><p role="alert">Registro indisponível: {errMsg(registry.error)}</p><Button onClick={()=>void registry.refetch()}>Tentar novamente</Button></section>;
 const people=data.characters.filter(p=>(p.display_name+' '+(p.house_id??'')).toLowerCase().includes(filter.toLowerCase()));
 const pending=data.pending.filter(q=>(q.proposed_name+' '+q.source_kind+' '+q.source_key).toLowerCase().includes(filter.toLowerCase()));
 const rationale=reason.trim().length>=10;
 return <section id="temporal-genealogias" className="narrator-calendar-panel character-registry" aria-label="Registro canônico de nobres">
  <h3>Nobres e genealogias · conciliação</h3>
  <p>Cada pessoa tem ID estável. Fontes não são unidas por semelhança de nome. Anos, mortes e identidades devem ser confirmados pelo Narrador.</p>
  <div className="character-registry-summary">
   <div><strong>{data.count}</strong><span>Pessoas canônicas</span></div>
   <div><strong>{data.characters.filter(p=>p.is_noble).length}</strong><span>Nobres</span></div>
   <div><strong>{data.pending_total}</strong><span>Fontes pendentes</span></div>
   <div><strong>{data.characters.filter(p=>p.review_status==='conflict').length}</strong><span>Conflitos</span></div>
  </div>
  <div className="campaign-actions">
   <Button type="button" disabled={busy} onClick={()=>void submit(async()=>{
    const r=await supabase.rpc('stage_campaign_character_sources');if(r.error)throw r.error;
    return 'Fontes internas adicionadas à fila sem alterar fichas: '+JSON.stringify(r.data);
   })}>Importar fontes internas</Button>
   <Button type="button" variant="outline" onClick={newPerson}>Nova pessoa</Button>
  </div>
  <details><summary>Importar manifesto do Atlas público (JSON)</summary>
   <p>Gere o arquivo com o script do repositório. A importação cria apenas candidatos para revisão, até 500 fontes por lote.</p>
   <textarea aria-label="Manifesto do Atlas" rows={3} value={manifest} onChange={e=>setManifest(e.target.value)}/>
   <Button variant="outline" disabled={busy||!manifest.trim()} onClick={()=>void submit(async()=>{
    const parsed:unknown=JSON.parse(manifest);
    if(!Array.isArray(parsed)||parsed.length>500)throw new Error('Manifesto inválido; máximo 500 entradas.');
    const r=await supabase.rpc('import_character_source_candidates',{p_candidates:parsed as Json});
    if(r.error)throw r.error;
    return 'Candidatos importados para revisão: '+String(r.data);
   })}>Registrar candidatos</Button>
  </details>
  <label>Pesquisar nome ou origem<input aria-label="Pesquisar nobres" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
  <details open><summary>Pendências de fontes ({data.pending_total})</summary>
   <div className="character-registry-list">
    {pending.length===0&&<p>Sem fontes nesta pesquisa.</p>}
    {pending.slice(0,120).map(q=><div className="character-registry-entry" key={q.id}>
     <div><strong>{q.proposed_name}</strong><small>{q.source_kind} · {q.source_key}</small>
      <small>{q.claimed_birth_year?'Nascimento alegado: '+q.claimed_birth_year+' CV · ':''}{q.claimed_age!==null?'Idade textual: '+q.claimed_age+' (referência não validada)':''}</small></div>
     <Button size="sm" variant="outline" type="button" onClick={()=>{
      newPerson();setCandidate(q);setName(q.proposed_name);setHouse(q.house_id??'');
      setMessage('Fonte selecionada: confira identidade e nascimento antes de cadastrar ou vincular.');
     }}>Revisar</Button>
    </div>)}
   </div>
   {candidate&&<div className="character-registry-review">
    <h4>Conciliação · {candidate.proposed_name}</h4>
    <label>Ação<select value={action} onChange={e=>setAction(e.target.value)} aria-label="Ação de conciliação">
     <option value="link">Vincular a pessoa canônica</option><option value="conflict">Marcar conflito</option><option value="ignore">Ignorar</option>
    </select></label>
    {action==='link'&&<label>Identidade confirmada<select aria-label="Pessoa para vincular" value={target} onChange={e=>setTarget(e.target.value)}>
     <option value="">Selecione a pessoa</option>
     {data.characters.map(p=><option key={p.id} value={p.id}>{p.display_name} ({p.id.slice(0,8)})</option>)}
    </select></label>}
    <Button type="button" disabled={busy||!rationale||(action==='link'&&!target)} onClick={()=>void submit(async()=>{
     const r=await supabase.rpc('review_character_source',{
      p_queue_id:candidate.id,p_action:action,p_character_id:action==='link'?target:null,p_reason:reason.trim(),
     });if(r.error)throw r.error;setCandidate(null);return 'Fonte conciliada com auditoria.';
    })}>Confirmar revisão da fonte</Button>
   </div>}
  </details>
  <details open><summary>Pessoas registradas ({data.count})</summary>
   <div className="character-registry-list">
    {people.length===0&&<p>Nenhuma pessoa cadastrada nesta pesquisa.</p>}
    {people.map(p=><div className="character-registry-entry" key={p.id}>
     <div><strong>{p.display_name}</strong><small>{p.house_id??'Sem Casa'} · {p.alive_status} · {p.review_status}</small></div>
     <Button type="button" size="sm" variant="outline" onClick={()=>choose(p)}>Editar cadastro</Button>
    </div>)}
   </div>
  </details>
  <details open><summary>{selectedPerson?'Editar pessoa canônica':'Registrar pessoa canônica'}</summary>
   <form className="campaign-form" onSubmit={e=>{e.preventDefault();void submit(async()=>{
    if((baseAge==='')!==(baseYear===''))throw new Error('Idade-base e ano de referência devem ser informados juntos.');
    const payload={
     ...(selectedPerson??{}),
     display_name:name.trim(),house_id:house.trim()||null,
     aliases:aliases.split(',').map(s=>s.trim()).filter(Boolean),
     noble_roles:roles.split(',').map(s=>s.trim()).filter(Boolean),
     race:race.trim()||null,is_noble:isNoble,
     birth_year:optNumber(birth),birth_date:birthDate.trim()||null,
     baseline_age:optNumber(baseAge),baseline_year:optNumber(baseYear),
     age_policy:agePolicy,age_exception_note:exceptionNote.trim()||null,
     apparent_age:apparentAge.trim()||null,
     alive_status:alive,death_year:optNumber(death),death_date:deathDate.trim()||null,
     visibility,owner_user_id:ownerId.trim()||null,confidence,
     review_status:reviewStatus,review_note:reviewNote,
    };
    const r=await supabase.rpc('save_campaign_character',{
     p_id:personId,p_version:selectedPerson?.version??null,p_payload:payload,p_reason:reason.trim(),
    });if(r.error)throw r.error;
    const saved=r.data as {id:string}|null;
    if(saved?.id){setPersonId(saved.id);setTarget(saved.id);}
    return 'Pessoa canônica salva sem modificar registros de origem. Vincule explicitamente as fontes.';
   });}}>
    <div className="house-input-grid">
     <label>Nome canônico<input required value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>ID da Casa oficial<input value={house} onChange={e=>setHouse(e.target.value)} placeholder="Ex.: harcourt"/></label>
     <label>Nascimento confirmado (CV)<input type="number" min={1} max={9999} value={birth} onChange={e=>setBirth(e.target.value)}/></label>
     <label>Data de nascimento Harptos<input value={birthDate} onChange={e=>setBirthDate(e.target.value)} placeholder="1492-01-01"/></label>
     <label>Idade-base confirmada<input type="number" min={0} value={baseAge} onChange={e=>setBaseAge(e.target.value)}/></label>
     <label>Ano da idade-base (CV)<input type="number" min={1} max={9999} value={baseYear} onChange={e=>setBaseYear(e.target.value)}/></label>
     <label>Estado vital<select value={alive} onChange={e=>setAlive(e.target.value)}><option value="unknown">A conferir</option><option value="alive">Vivo</option><option value="deceased">Falecido</option></select></label>
     <label>Ano do falecimento<input type="number" min={1} max={9999} value={death} onChange={e=>setDeath(e.target.value)}/></label>
     <label>Data da morte Harptos<input value={deathDate} onChange={e=>setDeathDate(e.target.value)} placeholder="1522-09-03"/></label>
     <label>Apelidos, separados por vírgula<input value={aliases} onChange={e=>setAliases(e.target.value)}/></label>
     <label>Funções nobiliárquicas, separadas por vírgula<input value={roles} onChange={e=>setRoles(e.target.value)}/></label>
     <label>Raça, se documentada<input value={race} onChange={e=>setRace(e.target.value)}/></label>
     <label>Idade aparente (texto narrativo)<input value={apparentAge} onChange={e=>setApparentAge(e.target.value)}/></label>
     <label>Política de idade<select value={agePolicy} onChange={e=>setAgePolicy(e.target.value)}><option value="year_turn">Ano civil de Harptos</option><option value="manual_exception">Exceção excepcional aprovada</option></select></label>
     <label>Visibilidade pretendida<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="gm">Segredo do Narrador</option><option value="house">Membros da Casa (projeção futura)</option><option value="player">Jogador proprietário (projeção futura)</option></select></label>
     {visibility==='player'&&<label>ID de conta proprietária<input value={ownerId} onChange={e=>setOwnerId(e.target.value)}/></label>}
     <label>Confiança da fonte<select value={confidence} onChange={e=>setConfidence(e.target.value)}><option value="unverified">Não verificada</option><option value="supported">Documentada</option><option value="confirmed">Confirmada</option></select></label>
     <label>Estado da revisão<select value={reviewStatus} onChange={e=>setReviewStatus(e.target.value)}><option value="pending">Pendente</option><option value="reviewed">Revisado</option><option value="conflict">Inconsistente</option></select></label>
    </div>
    {agePolicy==='manual_exception'&&<label>Motivo documentado da exceção<textarea minLength={10} required value={exceptionNote} onChange={e=>setExceptionNote(e.target.value)}/></label>}
    <label>Observações do processo de revisão<textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label>
    <label className="narrator-calendar-check"><input type="checkbox" checked={isNoble} onChange={e=>setIsNoble(e.target.checked)}/>Pessoa de linhagem nobre</label>
    <p className="house-caption">A idade cronológica será calculada no Lote 7. Não há incremento de idade gravado aqui. Campos adicionais e exceções são preservados no cadastro canônico.</p>
    <Button disabled={busy||!rationale||!name.trim()||(baseAge==='')!==(baseYear==='')}>{selectedPerson?'Atualizar pessoa':'Criar pessoa'}</Button>
   </form>
  </details>
  <details><summary>Relações de genealogia ({data.relations.length})</summary>
   {data.relations.map(r=><p key={r.id}>{data.characters.find(p=>p.id===r.from_character)?.display_name??'Pessoa'} — {r.relation} → {data.characters.find(p=>p.id===r.to_character)?.display_name??'Pessoa'}</p>)}
   <div className="house-input-grid">
    <label>Primeira pessoa<select aria-label="Origem da genealogia" value={fromId} onChange={e=>setFromId(e.target.value)}><option value="">Selecione</option>{data.characters.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
    <label>Segunda pessoa<select aria-label="Destino da genealogia" value={toId} onChange={e=>setToId(e.target.value)}><option value="">Selecione</option>{data.characters.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
    <label>Relação<select aria-label="Tipo de parentesco" value={relation} onChange={e=>setRelation(e.target.value)}><option value="parent">Genitor(a) → filho(a)</option><option value="spouse">Cônjuge</option><option value="sibling">Irmãos</option><option value="guardian">Guardião(ã)</option><option value="other">Outra</option></select></label>
   </div>
   <Button type="button" variant="outline" disabled={busy||!rationale||!fromId||!toId||fromId===toId} onClick={()=>void submit(async()=>{
    const r=await supabase.rpc('save_character_relation',{p_from:fromId,p_to:toId,p_relation:relation,p_note:'',p_reason:reason.trim()});
    if(r.error)throw r.error;return 'Vínculo genealógico auditado.';
   })}>Salvar relação familiar</Button>
  </details>
  <label>Justificativa de auditoria (mínimo 10 caracteres)<textarea aria-label="Justificativa canônica" rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <p role={isError?'alert':'status'} aria-live="polite">{message}</p>
 </section>;
}
