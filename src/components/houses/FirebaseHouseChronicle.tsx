/** Historical events and vassalage from an already authorized Firebase House
 * snapshot. The view does not contact Firestore, Supabase, or other Houses.
 * Nested vassal sheets are intentionally never inspected or displayed.
 */
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';

type Source=Record<string,unknown>;
type Delta={name:string;amount:number};
type Fortune={month:number|null;resource:string|null;outcome:string|null;
  result:number|null;changes:Delta[]};
type Action={month:number|null;type:string|null;notes:string|null};
type Vassal={name:string;status:string;loyalty:string|null;
  influencePenalty:number|null;approvedMonth:number|null};
type Section<T>={entries:T[];total:number|null;partial:boolean;invalid:boolean};
export type HouseChronicle={
  fortunes:Section<Fortune>;actions:Section<Action>;vassals:Section<Vassal>;
};
const asObj=(v:unknown):v is Source=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeText=(v:unknown,max=300):string|null=>
  typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const safeMonth=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
const safeAmount=(v:unknown):number|null=>
  typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000?v:null;
const STATUS:Record<string,string>={
  proposed:'Proposta',approved:'Aprovada',ended:'Encerrada',
};
const LOYALTY:Record<string,string>={
  loyal:'Leal',neutral:'Neutra',rebellious:'Rebelde',broken:'Rompida',
};
const known=(dictionary:Record<string,string>,v:unknown):string|null=>{
  const key=safeText(v,50);
  return key?(Object.hasOwn(dictionary,key)?dictionary[key]??key:key):null;
};
const resourceName=(v:unknown):string|null=>{
  const key=RESOURCE_KEYS.find(k=>k===v);
  return key?RESOURCE_NAMES[key]:null;
};
function section<T>(raw:unknown,limit:number,
  transform:(entry:Source)=>T):Section<T>{
  if(raw===undefined)return{entries:[],total:null,partial:false,invalid:false};
  if(!Array.isArray(raw))return{entries:[],total:null,partial:false,invalid:true};
  const entries:T[]=[];
  let invalid=false;
  for(const entry of raw.slice(0,limit)){
    if(!asObj(entry)){invalid=true;continue;}
    entries.push(transform(entry));
  }
  return{entries,total:raw.length,partial:raw.length>limit||invalid,invalid};
}
export function readFirebaseHouseChronicle(state:Source):HouseChronicle{
  const fortunes=section(state['fortunes'],40,f=>({
    month:safeMonth(f['month']),
    resource:resourceName(f['resource']),
    outcome:safeText(f['outcome'],500),
    result:safeAmount(f['result']),
    changes:asObj(f['changes'])?RESOURCE_KEYS.flatMap(k=>{
      const amount=safeAmount(f['changes'][k]);
      return amount===null?[]:[{name:RESOURCE_NAMES[k],amount}];
    }):[],
  }));
  const actions=section(state['actions'],60,a=>({
    month:safeMonth(a['month']),
    type:safeText(a['type'],100),
    notes:safeText(a['notes'],500),
  }));
  const vassals=section(state['vassals'],40,v=>({
    name:safeText(v['name'],160)??'Vassalo sem nome',
    status:known(STATUS,v['status'])??'Não informado',
    loyalty:known(LOYALTY,v['loyalty']),
    influencePenalty:safeAmount(v['influencePenalty']),
    approvedMonth:safeMonth(v['approvedMonth']),
  }));
  return{fortunes,actions,vassals};
}
const numberText=(v:number|null)=>v===null?'Não informado'
  :v.toLocaleString('pt-BR',{maximumFractionDigits:8});
function Coverage({invalid,partial}:{invalid:boolean;partial:boolean}){
  if(invalid)return <p role="status" className="text-sm">
    Há registros não interpretáveis. A ficha original foi preservada.
  </p>;
  if(partial)return <p role="status" className="text-sm">
    Exibição parcial: consulte a ficha integral para os demais registros.
  </p>;
  return null;
}
export function FirebaseHouseChronicle({houseName,state}:{
  houseName:string;state:Source;
}){
  const data=readFirebaseHouseChronicle(state);
  return <section aria-label={`Histórico da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Histórico, Fortuna e Vassalagem</h2>
      <p className="text-sm opacity-75">
        {houseName} · Somente dados da ficha autorizada no Firebase
      </p>
    </header>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
      {([
        ['Eventos de Fortuna',data.fortunes.total],
        ['Ações registradas',data.actions.total],
        ['Vassalos',data.vassals.total],
      ] as const).map(([label,n])=><div key={label}
        className="rounded border border-current/20 p-3">
        <p className="opacity-75">{label}</p>
        <p className="mt-1 font-semibold tabular-nums">{numberText(n)}</p>
      </div>)}
    </div>
    <div className="space-y-3">
      <details className="rounded border border-current/20 p-3">
        <summary className="font-semibold cursor-pointer">Eventos de Fortuna</summary>
        <div className="mt-3 space-y-2">
          {data.fortunes.total===null?<p>Histórico de Fortuna indisponível.</p>:
            data.fortunes.total===0?<p>Nenhum evento registrado.</p>:
            data.fortunes.entries.map((e,i)=><article key={i}
              className="rounded border border-current/15 p-3 text-sm space-y-1">
              <p className="font-semibold">
                {e.resource??'Recurso não informado'} · Mês {numberText(e.month)}
              </p>
              {e.outcome&&<p className="break-words whitespace-pre-wrap">
                {e.outcome}
              </p>}
              <p>Resultado registrado: {numberText(e.result)}</p>
              {e.changes.length>0&&<ul className="space-y-1">
                {e.changes.map(change=><li key={change.name}>
                  {change.name}: {change.amount>0?'+':''}{numberText(change.amount)}
                </li>)}
              </ul>}
            </article>)}
        </div>
        <Coverage invalid={data.fortunes.invalid} partial={data.fortunes.partial}/>
      </details>
      <details className="rounded border border-current/20 p-3">
        <summary className="font-semibold cursor-pointer">Ações da Casa</summary>
        <div className="mt-3 space-y-2">
          {data.actions.total===null?<p>Histórico de ações indisponível.</p>:
            data.actions.total===0?<p>Nenhuma ação registrada.</p>:
            data.actions.entries.map((a,i)=><article key={i}
              className="rounded border border-current/15 p-3 text-sm">
              <p className="font-semibold">
                {a.type??'Ação não informada'} · Mês {numberText(a.month)}
              </p>
              {a.notes&&<p className="mt-1 break-words whitespace-pre-wrap">
                {a.notes}
              </p>}
            </article>)}
        </div>
        <Coverage invalid={data.actions.invalid} partial={data.actions.partial}/>
      </details>
      <details className="rounded border border-current/20 p-3">
        <summary className="font-semibold cursor-pointer">Vassalagem</summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {data.vassals.total===null?<p>Vassalagem indisponível.</p>:
            data.vassals.total===0?<p>Nenhum vassalo registrado.</p>:
            data.vassals.entries.map((v,i)=><article key={i}
              className="rounded border border-current/15 p-3 text-sm space-y-1">
              <h3 className="font-semibold break-words">{v.name}</h3>
              <p>Situação: {v.status}</p>
              <p>Lealdade: {v.loyalty??'Não informada'}</p>
              <p>Penalidade de Influência registrada: {numberText(v.influencePenalty)}</p>
              {v.approvedMonth!==null&&<p>Mês de aprovação: {v.approvedMonth}</p>}
            </article>)}
        </div>
        <Coverage invalid={data.vassals.invalid} partial={data.vassals.partial}/>
      </details>
    </div>
    <p className="text-xs opacity-70">
      Consulta histórica sem operações de escrita. Não calcula efeitos atuais
      dos eventos ou da vassalagem; mantém o motor de regras original como referência.
    </p>
  </section>;
}
