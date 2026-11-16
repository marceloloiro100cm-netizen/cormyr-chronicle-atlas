/** Firebase-only schedule for projects already present in an authorized House.
 * This is a read-only timeline, NOT a project processor or completion action.
 * House calendar and project dates use the canonical month index.
 */
import {monthFromHarptosDate,projectTemporalNotice}
  from '@/lib/calendar/house-time-impact';

type Data=Record<string,unknown>;
type DateRef={year:number;month:number}|null;
export type ProjectTiming='in_progress'|'due_for_review'|'completed'|'cancelled'|'unverified';
export type ProjectScheduleRow={
  id:string;name:string;holdingName:string;status:string;
  start:number|null;duration:number|null;modifier:number|null;
  deadline:number|null;timing:ProjectTiming;
};
export type ConstructionScheduleView={
  available:boolean;total:number|null;partial:boolean;
  officialMonth:number|null;houseMonth:number|null;
  rows:ProjectScheduleRow[];dueCount:number|null;
};

const object=(v:unknown):v is Data=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const label=(v:unknown,max=160):string|null=>
  typeof v==='string'&&v.trim().length>0?v.trim().slice(0,max):null;
const positive=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000?v:null;
const modifier=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&Math.abs(v)<=10000?v:null;
function calendarMonth(date:DateRef):number|null{
  if(!date)return null;
  try{return monthFromHarptosDate(date);}
  catch{return null;}
}

/** Do not use missing calendar, modifier or status as zero or as proof
 * that work is complete. The caller must supply its own scoped House.
 */
export function readFirebaseConstructionSchedule(
  state:Data,date:DateRef,
):ConstructionScheduleView{
  const raw=state['projects'];
  const officialMonth=calendarMonth(date);
  const houseMonth=positive(state['month']);
  if(!Array.isArray(raw))return {
    available:false,total:null,partial:false,officialMonth,houseMonth,
    rows:[],dueCount:null,
  };
  const holdings=new Map<string,string>();
  if(Array.isArray(state['holdings'])){
    for(const h of state['holdings'].slice(0,500)){
      if(!object(h))continue;
      const id=label(h['id'],128),name=label(h['name']);
      if(id&&name)holdings.set(id,name);
    }
  }
  let partial=raw.length>100;
  const rows:ProjectScheduleRow[]=[];
  for(const [index,p] of raw.slice(0,100).entries()){
    if(!object(p)){partial=true;continue;}
    const status=label(p['status'],50)??'Não informado';
    const start=positive(p['start']),duration=positive(p['duration']);
    const adjustment=modifier(p['modifier']);
    const proposed=start!==null&&duration!==null&&adjustment!==null
      ?start+duration+adjustment:null;
    const deadline=proposed!==null&&Number.isSafeInteger(proposed)&&proposed>=0
      ?proposed:null;
    let timing:ProjectTiming='unverified';
    if(status==='completed')timing='completed';
    else if(status==='cancelled')timing='cancelled';
    else if(status==='building'&&deadline!==null&&
      houseMonth!==null&&officialMonth!==null){
      const result=projectTemporalNotice({
        status,start:start!,duration:duration!,modifier:adjustment!,
      },houseMonth,officialMonth);
      if(result==='in_progress'||result==='due_for_review')timing=result;
    }
    const holdingId=label(p['holdingId'],128);
    if(!label(p['id'],128)||!label(p['name'])||
       !['building','completed','cancelled'].includes(status))partial=true;
    rows.push({
      id:label(p['id'],128)??`registro-${index}`,
      name:label(p['name'])??'Projeto sem nome',
      holdingName:holdingId
        ?(holdings.get(holdingId)??'Posse vinculada não identificada')
        :'Posse não informada',
      status,start,duration,modifier:adjustment,deadline,timing,
    });
  }
  return {
    available:true,total:raw.length,partial,officialMonth,houseMonth,rows,
    dueCount:partial?null:rows.filter(p=>p.timing==='due_for_review').length,
  };
}

const description:Record<ProjectTiming,string>={
  in_progress:'Em andamento conforme prazo registrado',
  due_for_review:'Prazo atingido — precisa de revisão',
  completed:'Concluído no registro histórico',
  cancelled:'Cancelado no registro histórico',
  unverified:'Prazo não verificável',
};

export function FirebaseConstructionSchedule({houseName,state,calendar}:{
  houseName:string;state:Data;calendar:DateRef;
}){
  const data=readFirebaseConstructionSchedule(state,calendar);
  return <section aria-label={`Cronograma de obras da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-3">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Cronograma de obras e projetos</h2>
      <p className="text-sm opacity-75">
        {houseName} · leitura do snapshot autorizado e do calendário Firebase
      </p>
    </header>
    {!data.available
      ?<p role="status">Cronograma indisponível: a lista de projetos
        não está presente ou não tem formato verificável.</p>
      :<>
        <p className="text-sm">
          Projetos registrados: <strong>{data.total}</strong>
          {' · '}Prazos que exigem revisão: <strong>
            {data.dueCount===null?'Não apurado':data.dueCount}
          </strong>
        </p>
        {(data.officialMonth===null||data.houseMonth===null)&&
          <p role="status" className="text-sm">
            Calendário ou referência temporal da ficha indisponível:
            nenhum prazo será presumido.
          </p>}
        {data.officialMonth!==null&&data.houseMonth!==null&&
         data.officialMonth!==data.houseMonth&&
          <p role="status" className="text-sm">
            A ficha e o calendário oficial usam meses diferentes.
            Os projetos permanecem sujeitos à revisão do Narrador.
          </p>}
        {data.total===0?<p>Nenhum projeto registrado nesta Casa.</p>:
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.rows.map((p,i)=><article key={p.id+':'+i}
              className="rounded border border-current/20 p-3 space-y-1">
              <h3 className="font-semibold break-words">{p.name}</h3>
              <p className="text-sm">{p.holdingName}</p>
              <p className="text-sm">{description[p.timing]}</p>
              <p className="text-xs">
                Início: {p.start===null?'Não informado':`mês ${p.start}`}
                {' · '}Duração: {p.duration===null?'Não informada':
                  `${p.duration} mês(es)`}
              </p>
              <p className="text-xs">
                Prazo calculado: {p.deadline===null?'Não verificável':
                  `mês ${p.deadline}`}
              </p>
            </article>)}
          </div>}
        {data.partial&&<p role="status" className="text-sm">
          Exibição parcial ou registros inconsistentes; consultar a
          ficha integral antes de tomar decisões.
        </p>}
      </>}
    <p className="text-xs opacity-75">
      Previsão não é conclusão: este painel não avança o tempo, não
      conclui obras nem modifica recursos. Somente o fluxo oficial
      poderá confirmar o término de um projeto.
    </p>
  </section>;
}
