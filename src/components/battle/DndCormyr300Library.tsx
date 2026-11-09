import {useEffect,useMemo,useState,useRef,type ChangeEvent} from 'react';
import {Button} from '@/components/ui/button';
import {loadPrivateDndCormyr300} from '@/lib/crusade/dnd-cormyr-private-loader';
import {DndCustomMonsterEditor} from './DndCustomMonsterEditor';
import {feetToDndMetres,dndMetresToFeet,formatDndMetres} from '@/lib/crusade/dnd-metric';
import {saveDndCustomMonster} from '@/lib/crusade/dnd-private-custom';
import {saveDndCombatOverride,resetDndCombatOverride}
 from '@/lib/crusade/dnd-private-overrides';
import {
 DND_CORMYR_300_MAX_BYTES,DND_PROVISIONAL_FLY_SPEED_FT,
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
const damageTypes=[
 ['','Não verificado'],['slashing','Cortante'],['piercing','Perfurante'],
 ['bludgeoning','Concussão'],['fire','Fogo'],['cold','Frio'],
 ['force','Força'],['necrotic','Necrótico'],['radiant','Radiante'],
 ['acid','Ácido'],['lightning','Elétrico'],['poison','Veneno'],
 ['psychic','Psíquico'],['thunder','Trovão'],
] as const;
type MonsterEditor=Readonly<{id:string;hp:number;ac:number;speed_ft:number;
 fly_ft:number;dex_mod:string;
 melee_bonus:number;melee_damage:string;melee_damage_type:string;
 ranged_bonus:number;ranged_damage:string;ranged_damage_type:string;
 review_source:string;review_note:string}>;
export function DndCormyr300Library({
 onCatalog,onAdd,sideCounts,compact=false,
}:{
 onCatalog:(catalog:DndCormyrCatalog|null)=>void;
 /** Exibe somente o carregamento privado quando a seleção acontece no painel da batalha. */
 compact?:boolean;
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
 const [editor,setEditor]=useState<MonsterEditor|null>(null);
 const [saving,setSaving]=useState(false);
 const editNumber=(field:'hp'|'ac'|'speed_ft'|'fly_ft'|'melee_bonus'|'ranged_bonus',value:number)=>
  setEditor(old=>old?{...old,[field]:value}:old);
 const editDice=(field:'melee_damage'|'ranged_damage'|'dex_mod'|
  'melee_damage_type'|'ranged_damage_type'|'review_source'|'review_note',value:string)=>
  setEditor(old=>old?{...old,[field]:value}:old);
 const openEditor=(id:string)=>{
  const m=catalog?.monsters.find(x=>x.id===id);
  if(!m)return;
  setEditor({id,hp:m.hp,ac:m.ac,speed_ft:m.speed_ft,
   fly_ft:m.fly_ft??(m.speed_ft===0?DND_PROVISIONAL_FLY_SPEED_FT:0),
   dex_mod:m.dex_mod===undefined?'':String(m.dex_mod),
   melee_bonus:m.melee?.bonus??0,melee_damage:m.melee?.damage??'1d4',
   melee_damage_type:m.melee?.damage_type??'',
   ranged_bonus:m.ranged?.bonus??0,ranged_damage:m.ranged?.damage??'1d4',
   ranged_damage_type:m.ranged?.damage_type??'',
   review_source:'',review_note:m.review??''});
  setError('');setMessage('');
 };
 const saveEditor=async()=>{
  if(!editor)return;
  const m=catalog?.monsters.find(x=>x.id===editor.id);
  if(!m)return;
  setSaving(true);
  try{
   if(editor.id.startsWith('custom-')){
    await saveDndCustomMonster({...m,hp:editor.hp,ac:editor.ac,
     speed_ft:editor.speed_ft,fly_ft:editor.fly_ft,
     ...(editor.dex_mod.trim()?{dex_mod:Number(editor.dex_mod)}:{}),
     ...(editor.review_source.trim()?{review_source:editor.review_source.trim()}:{}),
     ...(editor.review_note.trim()?{review:editor.review_note.trim()}:{}),
     melee:m.melee?{...m.melee,bonus:editor.melee_bonus,
      damage:editor.melee_damage,
      ...(editor.melee_damage_type?{damage_type:editor.melee_damage_type}:{})}:null,
     ranged:m.ranged?{...m.ranged,bonus:editor.ranged_bonus,
      damage:editor.ranged_damage,
      ...(editor.ranged_damage_type?{damage_type:editor.ranged_damage_type}:{})}:null,
    });
   }else await saveDndCombatOverride(editor.id,{
    hp:editor.hp,ac:editor.ac,speed_ft:editor.speed_ft,fly_ft:editor.fly_ft,
    ...(m.melee?{melee_bonus:editor.melee_bonus,melee_damage:editor.melee_damage}:{}),
    ...(m.ranged?{ranged_bonus:editor.ranged_bonus,ranged_damage:editor.ranged_damage,
     ...(editor.ranged_damage_type?{ranged_damage_type:editor.ranged_damage_type as
      'bludgeoning'}:{})}:{}),
    ...(m.melee&&editor.melee_damage_type?{melee_damage_type:editor.melee_damage_type as
     'bludgeoning'}:{}),
    ...(editor.dex_mod.trim()?{dex_mod:Number(editor.dex_mod)}:{}),
    ...(editor.review_source.trim()?{review_source:editor.review_source.trim()}:{}),
    ...(editor.review_note.trim()?{review_note:editor.review_note.trim()}:{}),
   });
   const updated=await loadPrivateDndCormyr300();
   setCatalog(updated);onCatalog(updated);setEditor(null);
   setMessage('Ficha de combate salva no banco privado do Narrador.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao editar criatura.');}
  finally{setSaving(false);}
 };
 const resetEditor=async()=>{
  if(!editor)return;
  setSaving(true);
  try{
   await resetDndCombatOverride(editor.id);
   const updated=await loadPrivateDndCormyr300();
   setCatalog(updated);onCatalog(updated);setEditor(null);
   setMessage('Ajuste removido; atributos originais restaurados na ficha tática.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao restaurar ficha.');}
  finally{setSaving(false);}
 };
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
   setMessage(remote.monsters.length+' criaturas carregadas do banco privado do Narrador.');
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
   setError('');setMessage('Catálogo Cormyr importado e salvo neste navegador: '+parsed.monsters.length+' criaturas.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Arquivo do catálogo inválido.');
  }
 };
 if(compact)return <div className="dnd-cormyr-compact" aria-label="Estado do bestiário privado D&D">
  {catalog?<p role="status">{catalog.monsters.length} monstros disponíveis para seleção.</p>:
   <p role="status">Carregando monstros do bestiário privado…</p>}
  {error&&<p className="crz-alert" role="alert">{error}</p>}
 </div>;
 return <section className="dnd-cormyr-library" aria-label="Biblioteca de 300 monstros Cormyr">
  <h4>Biblioteca Cormyr · 300 criaturas-base + entradas próprias</h4>
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
  <DndCustomMonsterEditor onSaved={async()=>{
   const remote=await loadPrivateDndCormyr300();
   importedManually.current=false;
   setCatalog(remote);onCatalog(remote);
   setError('');setMessage('Catálogo V2 atualizado: '+remote.monsters.length+' criaturas.');
  }}/>
  {catalog&&<>
   <p className="dnd-cormyr-count" role="status">
    <strong>{catalog.monsters.length} criaturas carregadas</strong> ·
    {matched.length} resultados do filtro ·
    {groups.length} grupos</p>
   <p className="battle-note">Revisão de fichas: {catalog.monsters.filter(m=>m.melee&&!m.melee.damage_type||
     m.ranged&&!m.ranged.damage_type).length} criaturas com tipo de dano não confirmado.
    Os valores provisórios não são atributos oficiais.
    O Narrador pode completar Destreza, voo e fontes da revisão.</p>
   <p className="battle-note">Regras do Cormyr: ataques à distância não têm
    alcance máximo no tabuleiro, mas exigem linha de visão.
    Criaturas voadoras atravessam terreno bloqueado e florestas.
    {catalog.monsters.filter(m=>m.speed_ft===0&&m.fly_ft===undefined).length}
    fichas usam voo provisório de {formatDndMetres(DND_PROVISIONAL_FLY_SPEED_FT)}.
    O Narrador pode corrigir PV, CA, movimento e ataque sem sobrescrever a fonte.</p>
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
   {editor&&<section className="battle-surface" aria-label="Editor privado de criatura D&D">
    <h5>Editar ficha de combate · {catalog.monsters.find(m=>m.id===editor.id)?.name}</h5>
    <p>Ajuste privado apenas para simulações; a ficha original dos 300 é preservada.</p>
    <div className="dnd-cormyr-filters">
     <label>Modificador de DES (vazio = desconhecido)
      <input aria-label="Destreza D&D edição" type="number" min={-10} max={30}
       value={editor.dex_mod} onChange={e=>editDice('dex_mod',e.target.value)}/></label>
     <label>Fonte da revisão
      <input aria-label="Fonte da revisão D&D" value={editor.review_source}
       onChange={e=>editDice('review_source',e.target.value)}
       placeholder="Manual ou referência autorizada"/></label>
     <label>Notas da revisão
      <input aria-label="Notas da revisão D&D" value={editor.review_note}
       onChange={e=>editDice('review_note',e.target.value)}/></label>
     <label>PV<input type="number" min={1} max={100000} value={editor.hp}
      aria-label="PV D&D edição" onChange={e=>editNumber('hp',Number(e.target.value))}/></label>
     <label>CA<input type="number" min={1} max={40} value={editor.ac}
      aria-label="CA D&D edição" onChange={e=>editNumber('ac',Number(e.target.value))}/></label>
     <label>Deslocamento terrestre (m)<input type="number" min={0} max={300} step={0.5}
      value={feetToDndMetres(editor.speed_ft)} aria-label="Terrestre D&D edição"
      onChange={e=>editNumber('speed_ft',dndMetresToFeet(Number(e.target.value)))}/></label>
     <label>Voo (m; zero para desativar)<input type="number" min={0} max={300} step={0.5}
      value={feetToDndMetres(editor.fly_ft)} aria-label="Voo D&D edição"
      onChange={e=>editNumber('fly_ft',dndMetresToFeet(Number(e.target.value)))}/></label>
     {catalog.monsters.find(m=>m.id===editor.id)?.melee&&<>
      <label>Bônus corpo a corpo<input type="number" min={-30} max={60}
       value={editor.melee_bonus} aria-label="Bônus corpo a corpo D&D"
       onChange={e=>editNumber('melee_bonus',Number(e.target.value))}/></label>
      <label>Dano corpo a corpo<input value={editor.melee_damage}
       aria-label="Dano corpo a corpo D&D"
       onChange={e=>editDice('melee_damage',e.target.value)}/></label>
      <label>Tipo de dano corpo a corpo
       <select aria-label="Tipo corpo a corpo D&D" value={editor.melee_damage_type}
        onChange={e=>editDice('melee_damage_type',e.target.value)}>
        {damageTypes.map(([v,label])=><option key={v} value={v}>{label}</option>)}
       </select>
      </label>
     </>}
     {catalog.monsters.find(m=>m.id===editor.id)?.ranged&&<>
      <label>Bônus à distância<input type="number" min={-30} max={60}
       value={editor.ranged_bonus} aria-label="Bônus à distância D&D"
       onChange={e=>editNumber('ranged_bonus',Number(e.target.value))}/></label>
      <label>Dano à distância<input value={editor.ranged_damage}
       aria-label="Dano à distância D&D"
       onChange={e=>editDice('ranged_damage',e.target.value)}/></label>
      <label>Tipo de dano à distância
       <select aria-label="Tipo à distância D&D" value={editor.ranged_damage_type}
        onChange={e=>editDice('ranged_damage_type',e.target.value)}>
        {damageTypes.map(([v,label])=><option key={v} value={v}>{label}</option>)}
       </select>
      </label>
     </>}
    </div>
    <div className="dnd-cormyr-buttons">
     <Button disabled={saving} onClick={()=>void saveEditor()}>Salvar ficha privada</Button>
     <Button variant="outline" disabled={saving||editor.id.startsWith('custom-')}
      onClick={()=>void resetEditor()}>Restaurar original</Button>
     <Button variant="outline" disabled={saving} onClick={()=>setEditor(null)}>Cancelar</Button>
    </div>
   </section>}
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
      <th>{m.name}<small className="dnd-cormyr-source">{m.source}
       {m.speed_ft===0&&m.fly_ft===undefined?' · voo provisório '+formatDndMetres(30):''}
       {m.fly_ft!==undefined?' · voo '+formatDndMetres(m.fly_ft):''}
       {m.ranged?' · ataque à distância sem limite':''}
       </small></th>
      <td>{m.group}</td><td>{m.challenge_rating}</td><td>{m.size}</td>
      <td>{m.hp}</td><td>{m.ac}</td>
      <td>{[
       ...(m.melee?[m.melee.name+' '+(m.melee.bonus>=0?'+':'')+m.melee.bonus]:[]),
       ...(m.ranged?
        [m.ranged.name+' '+(m.ranged.bonus>=0?'+':'')+m.ranged.bonus+' (à distância)']:[]),
      ].join(' / ')}</td>
      <td><div className="dnd-cormyr-buttons">
       <Button type="button" variant="outline" size="sm"
        aria-label={'Editar ficha '+m.name} onClick={()=>openEditor(m.id)}>Editar</Button>
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
