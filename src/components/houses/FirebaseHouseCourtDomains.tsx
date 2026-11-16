/** Firebase Cloud House court and domains, from a single authorized
 * getHouse snapshot. Presentation only: never loads other Houses or remote assets.
 */
type Source=Record<string,unknown>&{
  court?:unknown;domains?:unknown;
};
type Row=Record<string,unknown>&{
  id?:unknown;name?:unknown;role?:unknown;notes?:unknown;
  terrain?:unknown;features?:unknown;community?:unknown;
};
type Person={
  key:string;name:string;role:string|null;notes:string|null;
};
type Domain={
  key:string;name:string;terrain:string|null;community:string|null;
  features:string[];notes:string|null;
};
type Group<T>={
  entries:T[];total:number|null;limited:boolean;invalid:boolean;
};
export type FirebaseCourtDomainsView={
  court:Group<Person>;domains:Group<Domain>;
};
const value=(v:unknown,max=240):string|null=>
  typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const object=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function readGroup<T>(
  raw:unknown,limit:number,convert:(entry:Row,index:number)=>T
):Group<T>{
  if(!Array.isArray(raw))return{
    entries:[],total:null,limited:false,invalid:false,
  };
  const entries:T[]=[];
  let invalid=false;
  for(const [i,entry] of raw.slice(0,limit).entries()){
    if(!object(entry)){invalid=true;continue;}
    entries.push(convert(entry,i));
  }
  return {entries,total:raw.length,limited:raw.length>limit,invalid};
}
export function readFirebaseCourtDomains(state:Source):FirebaseCourtDomainsView{
  const court=readGroup(state.court,60,(p,i)=>({
    key:value(p.id,120)??'court-'+i,
    name:value(p.name)??'Integrante sem nome',
    role:value(p.role)??null,
    notes:value(p.notes,600)??null,
  }));
  const domains=readGroup(state.domains,80,(d,i)=>({
    key:value(d.id,120)??'domain-'+i,
    name:value(d.name)??'Domínio sem nome',
    terrain:value(d.terrain,100),community:value(d.community,100),
    features:Array.isArray(d.features)
      ?d.features.filter((v):v is string=>typeof v==='string'&&v.trim().length>0)
        .slice(0,12).map(v=>v.trim().slice(0,120))
      :[],
    notes:value(d.notes,600),
  }));
  return {court,domains};
}
function PartialNotice({limited,invalid}:{limited:boolean;invalid:boolean}){
  if(!limited&&!invalid)return null;
  return <p role="status" className="text-sm">
    Exibição parcial: há registros além do limite ou entradas não interpretáveis.
    A ficha integral preserva os dados originais.
  </p>;
}
export function FirebaseHouseCourtDomains({houseName,state}:{
  houseName:string;state:Source;
}){
  const data=readFirebaseCourtDomains(state);
  return <div className="space-y-4" aria-label={'Corte e domínios de '+houseName}>
    <section aria-label={'Corte da Casa '+houseName}
      className="rounded-lg border border-current/25 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-semibold">Corte da Casa</h2>
        <p className="text-sm opacity-75">
          {houseName} · Registros no snapshot: {data.court.total??'Não informado'}
        </p>
      </header>
      {data.court.total===null?<p>Corte não disponível neste snapshot.</p>
        :data.court.total===0?<p>Nenhum integrante registrado.</p>
        :<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.court.entries.map((p,i)=><article key={p.key+':'+i}
            className="rounded border border-current/20 p-3 space-y-1">
            <h3 className="font-semibold break-words">{p.name}</h3>
            <p className="text-sm">Função: {p.role??'Não informada'}</p>
            {p.notes&&<p className="text-sm whitespace-pre-wrap break-words">
              {p.notes}
            </p>}
          </article>)}
        </div>}
      <PartialNotice limited={data.court.limited} invalid={data.court.invalid}/>
    </section>
    <section aria-label={'Domínios da Casa '+houseName}
      className="rounded-lg border border-current/25 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-semibold">Domínios da Casa</h2>
        <p className="text-sm opacity-75">
          {houseName} · Registros no snapshot: {data.domains.total??'Não informado'}
        </p>
      </header>
      {data.domains.total===null?<p>Domínios não disponíveis neste snapshot.</p>
        :data.domains.total===0?<p>Nenhum domínio registrado.</p>
        :<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.domains.entries.map((d,i)=><article key={d.key+':'+i}
            className="rounded border border-current/20 p-3 space-y-2">
            <h3 className="font-semibold break-words">{d.name}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="opacity-75">Terreno</dt>
                <dd>{d.terrain??'Não informado'}</dd></div>
              <div><dt className="opacity-75">Comunidade</dt>
                <dd>{d.community??'Não informada'}</dd></div>
            </dl>
            {d.features.length>0&&<p className="text-sm break-words">
              Características: {d.features.join(' · ')}
            </p>}
            {d.notes&&<p className="text-sm whitespace-pre-wrap break-words">
              {d.notes}
            </p>}
          </article>)}
        </div>}
      <PartialNotice limited={data.domains.limited} invalid={data.domains.invalid}/>
    </section>
    <p className="text-xs opacity-70">
      Consulta somente leitura da Casa autorizada. Não é possível criar,
      editar ou excluir integrantes e domínios por esta tela.
    </p>
  </div>;
}
