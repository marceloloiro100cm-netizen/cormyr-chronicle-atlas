import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {NarratorCalendar} from '@/components/calendar/narrator-calendar';
import {calendarDrift,type CalendarReference} from '@/lib/house/calendar-consistency';
import {campaignMonth} from '@/lib/house/regions';
import {balances,maxHouseStatus} from '@/lib/house/engine';
import {RESOURCE_KEYS,RESOURCE_NAMES,type HouseState} from '@/lib/house/types';

type RealmHouse={id:string;name:string;state:HouseState|null;version:number|null};
export function KingdomDashboard(){
 const calendar=useQuery({queryKey:['campaign-calendar'],queryFn:async()=>{
  const r=await supabase.rpc('get_campaign_calendar');if(r.error||!r.data)throw new Error('Calendário indisponível.');
  return r.data as unknown as CalendarReference;
 },refetchInterval:15000});
 const query=useQuery({queryKey:['house-realm-dashboard'],queryFn:async()=>{
  const role=await supabase.rpc('is_campaign_admin');
  if(role.error||!role.data)throw new Error('Painel do Reino exclusivo do Narrador.');
  const [houses,sheets]=await Promise.all([
   supabase.from('campaign_houses').select('id,name,season,active').eq('season',2).eq('active',true).order('name'),
   supabase.from('noble_house_sheets').select('house_id,state,version')
  ]);
  if(houses.error||sheets.error)throw new Error('Não foi possível reunir as fichas do Reino.');
  const byId=new Map((sheets.data??[]).map(s=>[s.house_id,s]));
  return (houses.data??[]).map(h=>{
   const stored=byId.get(h.id);
   const candidate=stored?.state as unknown as HouseState|undefined;
   return {id:h.id,name:h.name,state:candidate?.schemaVersion===1?candidate:null,version:stored?.version??null} as RealmHouse;
  });
 }});
 if(query.isPending)return <p role="status">Consultando as Casas da temporada…</p>;
 if(query.error||!query.data)return <p role="alert">{query.error?.message??'Painel indisponível'}</p>;
 return <section className="house-panel"><h3>Painel consolidado do Reino</h3>
 {calendar.data&&<p role="status">Referência global: <strong>{campaignMonth(calendarDrift(0,calendar.data).current)}</strong>.</p>}
 {calendar.isError&&<p role="alert" className="house-warning">Calendário global indisponível; a conciliação de períodos não pode ser conferida.</p>}
 <p>Casas ativas da Segunda Temporada · recursos disponíveis/total, unidades, obras e Sorte do mês. Os números são lidos do registro atual de cada Casa, sem alterar suas fichas.</p>
 <div style={{overflowX:'auto'}}><table className="campaign-table"><thead><tr><th>Casa</th>
 {RESOURCE_KEYS.map(k=><th key={k}>{RESOURCE_NAMES[k]}</th>)}<th>Alinhamento</th><th>Status máximo</th><th>Tropas</th><th>Obras</th><th>Sorte do mês</th></tr></thead><tbody>
 {query.data.map(h=>{
  const s=h.state,b=s?balances(s):null,drift=s&&calendar.data?calendarDrift(s.month,calendar.data):null;
  return <tr key={h.id}><th>{h.name}</th>{RESOURCE_KEYS.map(k=><td key={k}>{b?`${b.available[k]} / ${b.total[k]}`:'—'}</td>)}
  <td>{!s?'Sem ficha':!drift?'Não verificado':drift.delta===0?'Sincronizada':drift.delta>0?`Atrasada ${drift.delta} mês(es)`:`Adiantada ${-drift.delta} mês(es)`}</td>
  <td>{b?maxHouseStatus(b.total.influence):'—'}</td>
  <td>{s?s.units.filter(u=>!u.destroyed).length:'—'}</td><td>{s?s.projects.filter(p=>p.status==='building').length:'—'}</td>
  <td>{s?(drift&&drift.delta!==0?'Período divergente':s.fortunes.some(f=>f.month===s.month)?'Resolvida':'Pendente'):'Sem ficha'}</td></tr>;
 })}</tbody></table></div>
 <details className="house-ledger"><summary>Calendário global e avanço de todas as Casas</summary>
 <p>Publique o novo mês no Calendário do Narrador. O banco avança as obras das fichas e registra a operação. Casas que já estavam adiantadas ou atrasadas devem ser conferidas individualmente antes de realizar novas ações mensais.</p>
 <NarratorCalendar/></details>
 </section>;
}
