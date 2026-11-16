/** Firebase Cloud: resource and treasury snapshot for an already authorized House.
 * This view never derives spendable balances: the canonical balance engine also
 * accounts for holdings, units, regional/history bonuses and mail consequences.
 * It neither queries additional Houses nor exposes any mutation actions.
 */
import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource} from '@/lib/house/types';

type RecordValue=Record<string,unknown>;
type Snapshot=RecordValue&{
  base?:unknown;permanent?:unknown;treasury?:unknown;budget?:unknown;
  method?:unknown;phase?:unknown;month?:unknown;identity?:unknown;
  regionalApplied?:unknown;
};
type ResourceRow={
  key:Resource;label:string;base:number|null;permanent:number|null;
};
export type FirebaseResourceSnapshot={
  rows:ResourceRow[];baseComplete:boolean;permanentComplete:boolean;
  treasury:number|null;budget:number|null;method:string|null;
  phase:string|null;month:number|null;region:string|null;
  regionalApplied:boolean|null;
};
const object=(v:unknown):v is RecordValue=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const score=(v:unknown):number|null=>
  typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000?v:null;
const count=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000?v:null;
const treasuryValue=(v:unknown):number|null=>
  typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000000000?v:null;
const cleanText=(v:unknown,max=100):string|null=>
  typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const METHODS:Record<string,string>={
  import:'Importação',budget:'Orçamento',roll:'Rolagem',
};
const PHASES:Record<string,string>={
  draft:'Rascunho',review:'Revisão',active:'Ativa',
};
const display=(v:number|null):string=>v===null?'Não informado'
  :v.toLocaleString('pt-BR',{maximumFractionDigits:12});

export function readFirebaseHouseResources(state:Snapshot):FirebaseResourceSnapshot{
  const base=object(state.base)?state.base:null;
  const permanent=object(state.permanent)?state.permanent:null;
  const rows=RESOURCE_KEYS.map(key=>({
    key,label:RESOURCE_NAMES[key],
    base:score(base?.[key]),permanent:score(permanent?.[key]),
  }));
  const method=cleanText(state.method,60);
  const phase=cleanText(state.phase,60);
  const identity=object(state.identity)?state.identity:null;
  return {
    rows,baseComplete:rows.every(r=>r.base!==null),
    permanentComplete:rows.every(r=>r.permanent!==null),
    treasury:treasuryValue(state.treasury),budget:count(state.budget),
    method:method?(Object.hasOwn(METHODS,method)?METHODS[method]??method:method):null,
    phase:phase?(Object.hasOwn(PHASES,phase)?PHASES[phase]??phase:phase):null,
    month:count(state.month),
    region:cleanText(identity?.['region'],150),
    regionalApplied:typeof state.regionalApplied==='boolean'
      ?state.regionalApplied:null,
  };
}
export function FirebaseHouseResources({houseName,state}:{
  houseName:string;state:Snapshot;
}){
  const data=readFirebaseHouseResources(state);
  return <section aria-label={`Recursos da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Recursos e Tesouro</h2>
      <p className="text-sm opacity-75">
        {houseName} · Consulta exclusiva do snapshot autorizado no Firebase
      </p>
    </header>
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {([
        ['Tesouro registrado',display(data.treasury)],
        ['Orçamento autorizado',display(data.budget)],
        ['Fase da ficha',data.phase??'Não informada'],
        ['Mês da ficha',display(data.month)],
      ] as const).map(([label,value])=>
        <div key={label} className="rounded border border-current/20 p-3">
          <dt className="text-xs opacity-75">{label}</dt>
          <dd className="mt-1 font-semibold break-words">{value}</dd>
        </div>)}
    </dl>
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
      <div><dt className="opacity-75">Região</dt>
        <dd>{data.region??'Não informada'}</dd></div>
      <div><dt className="opacity-75">Método de criação</dt>
        <dd>{data.method??'Não informado'}</dd></div>
      <div><dt className="opacity-75">Bônus regional aplicado</dt>
        <dd>{data.regionalApplied===null?'Não informado':
          data.regionalApplied?'Sim':'Não'}</dd></div>
    </dl>
    <div className="overflow-x-auto rounded border border-current/20">
      <table className="w-full border-collapse text-sm">
        <caption className="p-3 text-left font-semibold">
          Sete atributos da Casa — valores registrados
        </caption>
        <thead>
          <tr className="border-b border-current/20">
            <th scope="col" className="p-3 text-left">Recurso</th>
            <th scope="col" className="p-3 text-right">Base</th>
            <th scope="col" className="p-3 text-right">Permanente</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row=><tr key={row.key}
            className="border-b border-current/10 last:border-0">
            <th scope="row" className="p-3 text-left font-medium">{row.label}</th>
            <td className="p-3 text-right tabular-nums">{display(row.base)}</td>
            <td className="p-3 text-right tabular-nums">{display(row.permanent)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {(!data.baseComplete||!data.permanentComplete)&&
      <p role="status" className="text-sm">
        Valores incompletos ou inválidos no snapshot. Campos ausentes não
        foram substituídos por zero e os registros foram preservados.
      </p>}
    <p className="text-sm">
      Base e permanente são parcelas registradas, não o saldo disponível.
      O quadro seguinte mostra a apuração oficial apenas quando a ficha
      completa pode ser validada pelo motor de regras original.
    </p>
    <p className="text-xs opacity-70">
      Este quadro preserva os valores históricos e não permite mutações.
      Lançamentos do Tesouro operacional, quando autorizados, são registrados
      separadamente e não substituem o snapshot desta ficha.
    </p>
  </section>;
}
