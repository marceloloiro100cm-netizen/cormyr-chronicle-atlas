import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {ageDashboardCsv,validateAgeDashboard,type CharacterAgeDashboard} from '@/lib/calendar/character-ages';

export function NarratorCharacterAges({targetYear}: {targetYear?:number|undefined}){
 const clock=useCampaignTime();
 const currentYear=clock.data?.year??null;
 const [chosenYear,setChosenYear]=useState<number|null>(null);
 const yearTo=targetYear??chosenYear??(currentYear!==null?Math.min(9999,currentYear+1):null);
 const enabled=currentYear!==null&&yearTo!==null&&Number.isInteger(yearTo)&&yearTo>=1&&yearTo<=9999;
 const dashboard=useQuery({
  queryKey:['character-age-dashboard',currentYear,yearTo],
  enabled,
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('get_character_age_dashboard',{
    p_year:currentYear!,p_target_year:yearTo!,p_limit:2000
   });
   if(error)throw error;
   return validateAgeDashboard(data,currentYear!,yearTo!);
  },
  refetchInterval:30000,
 });
 const history=useQuery({
  queryKey:['character-year-transitions'],
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('get_character_year_transitions',{p_limit:20});
   if(error)throw error;
   return data as unknown as {id:string;calendar_version:number;from_year:number;to_year:number;created_at:string}[];
  },refetchInterval:30000
 });
 const stats=dashboard.data?.totals;
 const records=dashboard.data?.characters??[];
 const exportCsv=(data:CharacterAgeDashboard)=>{
  const blob=new Blob(['\uFEFF'+ageDashboardCsv(data)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='cormyr-idades-'+data.current_year+'-'+data.target_year+'.csv';
  anchor.click();
  URL.revokeObjectURL(url);
 };
 return <section id="temporal-idades" className="narrator-calendar-panel character-age-panel"
  aria-label="Motor anual de idades dos nobres">
  <h3>Nobres e idades · ano oficial</h3>
  <p>As idades não são gravadas nem somadas nas fichas. Elas são derivadas de nascimento ou referência aprovada, usando o ano publicado de Harptos.</p>
  <div className="house-input-grid">
   <label>Comparar com o ano (CV)
    <input type="number" min={1} max={9999} value={yearTo??''}
     disabled={targetYear!==undefined}
     aria-label="Ano de prévia de envelhecimento"
     onChange={e=>setChosenYear(e.target.value?Number(e.target.value):0)}/>
   </label>
  </div>
  {targetYear!==undefined&&<p className="house-caption">Ano de destino definido pela prévia oficial do Narrador; não é alterado por este painel.</p>}
  {dashboard.isPending||dashboard.isFetching?<p role="status">Calculando idades na fonte oficial…</p>:
   dashboard.error?<p role="alert">Prévia de idades indisponível. {dashboard.error instanceof Error?dashboard.error.message:'Acesso ou conexão inválidos.'}</p>:
   dashboard.data&&stats?<>
    <div className="character-registry-summary" role="group" aria-label="Resumo de idades canônicas">
     <div><strong>{stats.nobles}</strong><span>Nobres cadastrados</span></div>
     <div><strong>{stats.alive}</strong><span>Pessoas vivas</span></div>
     <div><strong>{stats.deceased}</strong><span>Falecidos</span></div>
     <div><strong>{stats.aged_nobles}</strong><span>Nobres que envelhecem</span></div>
     <div><strong>{stats.pending}</strong><span>Exigem revisão</span></div>
     <div><strong>{stats.conflicts}</strong><span>Conflitos</span></div>
     <div><strong>{stats.unknown}</strong><span>Sem idade confiável na comparação</span></div>
    </div>
    <p><strong>{dashboard.data.current_year} CV → {dashboard.data.target_year} CV</strong> · {stats.aged_nobles} nobre(s) envelhece(m) no período consultado.</p>
    {stats.pending>0&&<p className="house-caption">Pendências não impedem avançar o calendário: os personagens sem comprovação não recebem idade inventada.</p>}
    <div className="character-registry-list" role="table" aria-label="Prévia de idade por identidade">
     <div className="character-registry-entry" role="row"><strong role="columnheader">Pessoa · Casa</strong><strong role="columnheader">Antes</strong><strong role="columnheader">Depois · situação</strong></div>
     {records.map(c=><div className="character-registry-entry" key={c.id} role="row">
      <span role="cell"><strong>{c.display_name}</strong><small>{c.house_id??'Sem Casa'} · {c.noble_roles.join(', ')||'Sem título indicado'} · {c.race??'Raça não informada'}</small></span>
      <span role="cell">{c.before_age.age===null?'A conferir':c.before_age.age+' anos'}</span>
      <span role="cell">{c.after_age.age===null?'A conferir':c.after_age.age+' anos'}<small>{c.after_age.status==='deceased'?'Falecido — idade congelada':c.after_age.status==='ok'?'Idade cronológica':c.after_age.status}</small></span>
     </div>)}
    </div>
    {dashboard.data.truncated&&<p role="alert">Mais de 2.000 pessoas cadastradas. A exportação contém apenas a primeira página; não a trate como completa.</p>}
    <Button type="button" variant="outline" disabled={!records.length} onClick={()=>exportCsv(dashboard.data!)}>
     Exportar prévia de idades (CSV)
    </Button>
   </>:null}
  <details><summary>Auditoria de viradas anuais</summary>
   {history.error&&<p role="alert">Histórico anual indisponível.</p>}
   {!history.data?.length&&<p>Nenhuma virada registrada neste mecanismo.</p>}
   {history.data?.map(h=><p key={h.id}>{h.from_year} → {h.to_year} CV · versão {h.calendar_version}</p>)}
  </details>
 </section>;
}
