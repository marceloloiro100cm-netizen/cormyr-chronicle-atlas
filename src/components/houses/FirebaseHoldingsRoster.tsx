/** Firebase Cloud: presentation of holdings from one already-authorized House.
 * No additional Firestore request, cross-House join, purchase, or data mutation.
 */
type V=Record<string,unknown>&{
  holdings?:unknown;domains?:unknown;projects?:unknown;
  id?:unknown;name?:unknown;status?:unknown;category?:unknown;
  domainId?:unknown;holdingId?:unknown;parentId?:unknown;
  source?:unknown;itemId?:unknown;start?:unknown;duration?:unknown;
};
const STATUS={
  active:'Ativa',building:'Em construção',destroyed:'Destruída',
  abandoned:'Abandonada',sold:'Vendida',cancelled:'Cancelada',
} as const;
const text=(v:unknown,max=160)=>typeof v==='string'&&v.trim()
  ?v.trim().slice(0,max):null;
const obj=(v:unknown):v is V=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
type ProjectView={name:string;status:string;start:number|null;duration:number|null};
type HoldingView={
  id:string;name:string;status:string;statusKey:string|null;category:string|null;
  domain:string|null;parent:string|null;source:string|null;projects:ProjectView[];
};
type HoldingsView={
  total:number;limited:boolean;unreadable:number;rows:HoldingView[];
  active:number|null;building:number|null;inactive:number|null;
};
export function readFirebaseHoldings(state:V):HoldingsView{
  const raw=Array.isArray(state.holdings)?state.holdings:[];
  const domains=Array.isArray(state.domains)?state.domains:[];
  const projects=Array.isArray(state.projects)?state.projects:[];
  const names=new Map<string,string>();
  for(const d of domains){
    if(!obj(d))continue;
    const id=text(d.id,120),name=text(d.name);
    if(id&&name)names.set(id,name);
  }
  let unreadable=0;
  const rows:HoldingView[]=[];
  for(const [i,h] of raw.slice(0,150).entries()){
    if(!obj(h)){unreadable++;continue;}
    const id=text(h.id,120);
    const key=text(h.status,40);
    const domainId=text(h.domainId,120);
    const matches=projects.filter(p=>obj(p)&&id&&text(p.holdingId,120)===id);
    const related=matches.slice(0,10).map(p=>{
      if(!obj(p))return null;
      return {
        name:text(p.name)??'Projeto sem nome',
        status:text(p.status,60)??'Não informado',
        start:nonnegative(p.start),duration:nonnegative(p.duration),
      };
    }).filter((p):p is ProjectView=>p!==null);
    if(matches.length>10)related.push({
      name:`Mais ${matches.length-10} projeto(s) na ficha integral`,
      status:'Consulta integral',start:null,duration:null,
    });
    rows.push({
      id:id??`sem-id-${i}`,name:text(h.name)??'Posse sem nome',
      statusKey:key,status:key&&key in STATUS
        ?STATUS[key as keyof typeof STATUS]:(key??'Não informado'),
      category:text(h.category),domain:domainId?(names.get(domainId)??'Domínio não identificado'):null,
      parent:text(h.parentId,120),source:text(h.source,180),projects:related,
    });
  }
  const limited=raw.length>150;
  const allStatusesKnown=!limited&&unreadable===0&&rows.length===raw.length&&
    rows.every(h=>h.statusKey!==null&&h.statusKey in STATUS);
  const active=allStatusesKnown?rows.filter(h=>h.statusKey==='active').length:null;
  const building=allStatusesKnown?rows.filter(h=>h.statusKey==='building').length:null;
  const inactive=allStatusesKnown?rows.filter(
    h=>h.statusKey!=='active'&&h.statusKey!=='building').length:null;
  return {total:raw.length,limited,unreadable,rows,active,building,inactive};
}
export function FirebaseHoldingsRoster({houseName,state}:{
  houseName:string;state:V;
}){
  const data=readFirebaseHoldings(state);
  const n=(value:number|null)=>value===null?'Não informado':value.toLocaleString('pt-BR');
  return <section aria-label={`Posses da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Posses e construções</h2>
      <p className="text-sm opacity-75">{houseName} · Snapshot autorizado do Firebase</p>
    </header>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {([
        ['Registros',data.total],['Ativas',data.active],
        ['Em construção',data.building],['Inativas',data.inactive],
      ] as const).map(([label,value])=>
        <div className="rounded border border-current/20 p-3" key={label}>
          <dt className="text-xs opacity-75">{label}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{n(value)}</dd>
        </div>)}
    </dl>
    {data.total===0?<p>Nenhuma posse registrada nesta ficha.</p>:
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.rows.map((h,i)=><article key={h.id+':'+i}
          className="rounded border border-current/20 p-3 space-y-2">
          <div className="flex justify-between gap-3 items-start">
            <h3 className="font-semibold break-words">{h.name}</h3>
            <span className="text-xs whitespace-nowrap">{h.status}</span>
          </div>
          {h.category&&<p className="text-sm">Categoria: {h.category}</p>}
          <p className="text-sm">Local: {h.domain??'Não informado'}</p>
          {h.projects.length>0&&<details className="text-sm">
            <summary className="cursor-pointer">
              Projetos vinculados · {h.projects.length}
            </summary>
            <ul className="mt-2 space-y-1">
              {h.projects.map((p,j)=><li key={j} className="border-t pt-1">
                {p.name} · {p.status}
                {p.duration!==null?` · Prazo registrado: ${p.duration} mês(es)`:''}
              </li>)}
            </ul>
          </details>}
          {h.source&&<p className="text-xs opacity-70 break-words">
            Fonte registrada: {h.source}
          </p>}
        </article>)}
      </div>}
    {(data.limited||data.unreadable>0)&&<p role="status" className="text-sm">
      A exibição é parcial: há registros além do limite ou em formato não
      interpretável. Os dados originais permanecem na ficha completa;
      nenhum registro foi modificado.
    </p>}
    <p className="text-xs opacity-70">
      Somente leitura. Nenhuma compra, evolução ou conclusão de obras
      é autorizada por este painel.
    </p>
  </section>;
}
