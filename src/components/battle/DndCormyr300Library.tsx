import {useEffect,useMemo,useState,useRef,type ChangeEvent} from 'react';
import {Button} from '@/components/ui/button';
import {loadPrivateDndCormyr300} from '@/lib/crusade/dnd-cormyr-private-loader';
import {
 DND_CORMYR_300_MAX_BYTES,
 DND_CORMYR_DEFAULT_FILTERS,
 parseDndCormyr300,readDndCormyr300Local,saveDndCormyr300Local,
 filterDndCormyr300,dndCormyrTemplateId,
 type DndCormyrCatalog,type DndCormyrOptions,
} from '@/lib/crusade/dnd-cormyr-300';

const groups=['Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos'];
const sizes=[['T','Miúdo'],['S','Pequeno'],['M','Médio'],
 ['L','Grande'],['H','Enorme'],['G','Gargantuesco']];
const types=[['dragon','Dragão'],['humanoid','Humanoide'],
 ['construct','Constructo'],['undead','Morto-vivo']];
const PER_PAGE=30;
export function DndCormyr300Library({
 onCatalog,onAdd,sideCounts,
}:{
 onCatalog:(catalog:DndCormyrCatalog|null)=>void;
 onAdd:(templateId:string,name:string,side:'attacker'|'defender',count:number)=>void;
 sideCounts:Readonly<Record<'attacker'|'defender',number>>;
}){
 const [catalog,setCatalog]=useState<DndCormyrCatalog|null>(null);
 const importedManually=useRef(false);
 const [filters,setFilters]=useState<DndCormyrOptions>({...DND_CORMYR_DEFAULT_FILTERS});
 const [shown,setShown]=useState(PER_PAGE);
 const [count,setCount]=useState(1);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const sourceOptions=useMemo(()=>[...new Set(catalog?.monsters.map(m=>m.source)??[])]
  .sort(),[catalog]);
 const matched=useMemo(()=>catalog?filterDndCormyr300(catalog.monsters,filters):[],
  [catalog,filters]);
 const visible=matched.slice(0,shown);
 const updateFilter=(patch:Partial<DndCormyrOptions>)=>{
  setFilters(current=>({...current,...patch}));setShown(PER_PAGE);
 };
 useEffect(()=>{
  const cached=readDndCormyr300Local();
  if(cached){setCatalog(cached);onCatalog(cached);}
  // Testes de interface rodam sem sessão/servidor; verificação de acesso real
  // permanece na função de servidor com autenticação e RLS Supabase.
  if(import.meta.env.MODE==='test')return;
  let active=true;
  void loadPrivateDndCormyr300().then(remote=>{
   if(!active||importedManually.current)return;
   setCatalog(remote);onCatalog(remote);
   setError('');
   setMessage('300 criaturas carregadas automaticamente do banco privado do Narrador.');
  }).catch(cause=>{
   if(!active||cached||importedManually.current)return;
   setError(cause instanceof Error?cause.message:
    'Catálogo privado indisponível. Importe seu JSON localmente.');
  });
  return ()=>{active=false;};
 },[]); // eslint-disable-line react-hooks/exhaustive-deps
 const read=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(!file)return;
  try{
   if(file.size>DND_CORMYR_300_MAX_BYTES)
    throw Error('Arquivo JSON ultrapassa o limite de 600 KB.');
   const parsed=parseDndCormyr300(await file.text());
   importedManually.current=true;
   saveDndCormyr300Local(parsed);
   setCatalog(parsed);onCatalog(parsed);
   setFilters({...DND_CORMYR_DEFAULT_FILTERS});setShown(PER_PAGE);
   setError('');setMessage('Catálogo Cormyr importado e salvo neste navegador: 300 criaturas.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Arquivo do catálogo inválido.');
  }
 };
 return <section className="dnd-cormyr-library" aria-label="Biblioteca de 300 monstros Cormyr">
  <h4>Biblioteca Cormyr · 300 criaturas de Faerûn</h4>
  <p>O banco privado carrega automaticamente as 300 criaturas para o Narrador autenticado.
   Você também pode importar o arquivo <strong>bestiario_cormyr_faerun_300.json</strong>
   como alternativa local. O conteúdo não é publicado no repositório nem para jogadores.</p>
  <label>Carregar catálogo Cormyr 300 (JSON)
   <input type="file" accept=".json,application/json"
    aria-label="Importar catálogo Cormyr 300"
    onChange={event=>{void read(event);}}/>
  </label>
  {message&&<p role="status">{message}</p>}
  {error&&<p className="crz-alert" role="alert">{error}</p>}
  {catalog&&<>
   <p className="dnd-cormyr-count" role="status">
    <strong>{catalog.monsters.length} criaturas carregadas</strong> ·
    {matched.length} resultados do filtro ·
    {groups.length} grupos</p>
   <div className="dnd-cormyr-filters" role="group" aria-label="Filtros de monstros Cormyr">
    <label>Nome ou fonte
     <input type="search" aria-label="Buscar monstro Cormyr"
      placeholder="Buscar monstro..."
      value={filters.search} onChange={e=>updateFilter({search:e.target.value})}/>
    </label>
    <label>Grupo
     <select aria-label="Filtrar grupo Cormyr" value={filters.group}
      onChange={e=>updateFilter({group:e.target.value})}>
      <option value="all">Todos os grupos</option>
      {groups.map(g=><option key={g} value={g}>{g}</option>)}
     </select>
    </label>
    <label>Tipo de criatura
     <select aria-label="Filtrar tipo de criatura Cormyr" value={filters.type}
      onChange={e=>updateFilter({type:e.target.value})}>
      <option value="all">Todos os tipos</option>
      {types.map(([id,name])=><option key={id} value={id}>{name}</option>)}
     </select>
    </label>
    <label>Tamanho
     <select aria-label="Filtrar tamanho Cormyr" value={filters.size}
      onChange={e=>updateFilter({size:e.target.value})}>
      <option value="all">Todos os tamanhos</option>
      {sizes.map(([id,name])=><option key={id} value={id}>{name}</option>)}
     </select>
    </label>
    <label>Fonte
     <select aria-label="Filtrar fonte Cormyr" value={filters.source}
      onChange={e=>updateFilter({source:e.target.value})}>
      <option value="all">Todas as fontes</option>
      {sourceOptions.map(src=><option value={src} key={src}>{src}</option>)}
     </select>
    </label>
    <label>ND mínimo
     <input type="number" aria-label="ND mínimo Cormyr" min={0} max={30} step={0.125}
      value={filters.minCr} onChange={e=>updateFilter({minCr:
       Math.max(0,Math.min(30,Number(e.target.value)||0))})}/>
    </label>
    <label>ND máximo
     <input type="number" aria-label="ND máximo Cormyr" min={0} max={30} step={0.125}
      value={filters.maxCr} onChange={e=>updateFilter({maxCr:
       Math.max(0,Math.min(30,Number(e.target.value)||0))})}/>
    </label>
    <label>Ordenar
     <select aria-label="Ordenar monstros Cormyr" value={filters.order}
      onChange={e=>updateFilter({order:e.target.value as DndCormyrOptions['order']})}>
      <option value="name">Nome A–Z</option>
      <option value="cr-asc">ND crescente</option>
      <option value="cr-desc">ND decrescente</option>
     </select>
    </label>
   </div>
   <div className="dnd-cormyr-add-controls">
    <label>Quantidade por nova pilha
     <input aria-label="Quantidade para adicionar monstro" type="number"
      min={1} max={1000} step={1} value={count}
      onChange={e=>setCount(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/>
    </label>
    <p>Adicione como atacante ou defensor. Depois ajuste a quantidade diretamente
     na lista de pilhas. Limite inicial: sete pilhas de cada lado.</p>
   </div>
   <div className="dnd-table-scroll" role="region" aria-label="Resultados do bestiário Cormyr">
    <table>
     <thead><tr><th>Nome</th><th>Grupo</th><th>ND</th>
      <th>Tam.</th><th>PV</th><th>CA</th>
      <th>Ataques básicos</th><th>Ações</th></tr></thead>
     <tbody>{visible.map(m=><tr key={m.id}>
      <th>{m.name}<small className="dnd-cormyr-source">{m.source}</small></th>
      <td>{m.group}</td><td>{m.challenge_rating}</td><td>{m.size}</td>
      <td>{m.hp}</td><td>{m.ac}</td>
      <td>{[m.melee,m.ranged].filter(Boolean).map(a=>
       a!.name+' '+(a!.bonus>=0?'+':'')+a!.bonus).join(' / ')}</td>
      <td><div className="dnd-cormyr-buttons">
       <Button type="button" variant="outline" size="sm"
        aria-label={'Adicionar '+m.name+' ao atacante'}
        disabled={sideCounts.attacker>=7}
        onClick={()=>onAdd(dndCormyrTemplateId(m),m.name,'attacker',count)}>Atacante</Button>
       <Button type="button" variant="outline" size="sm"
        aria-label={'Adicionar '+m.name+' ao defensor'}
        disabled={sideCounts.defender>=7}
        onClick={()=>onAdd(dndCormyrTemplateId(m),m.name,'defender',count)}>Defensor</Button>
      </div></td>
     </tr>)}</tbody>
    </table>
   </div>
   {matched.length===0&&<p role="status">Nenhuma criatura corresponde aos filtros.</p>}
   {matched.length>shown&&<Button type="button" variant="outline"
    onClick={()=>setShown(s=>s+PER_PAGE)}>
    Mostrar mais criaturas ({Math.min(shown,matched.length)} de {matched.length})</Button>}
  </>}
 </section>;
}
