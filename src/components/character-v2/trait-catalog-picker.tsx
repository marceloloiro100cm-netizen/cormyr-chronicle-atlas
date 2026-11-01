import {useState} from 'react';
import {CHARACTER_TRAITS,type CharacterTrait} from '@/lib/character-v2/catalog';
import {describeCharacterTrait} from '@/lib/character-v2/trait-descriptions';
import {CHARACTER_SKILL_LABELS,CHARACTER_SKILL_IDS} from '@/lib/character-v2/schema';

type SelectorProps={kind:'benefit'|'flaw';value:string;onChange:(next:string)=>void};
const categories=[
 ['fortune','Fortuna'],['heritage','Herança'],['ability','Habilidade'],
 ['martial','Marcial'],['social','Social'],['flaw','Defeitos'],
] as const;

function splitEntries(value:string):string[]{
 return value.split(/\r?\n|;/).map(v=>v.trim()).filter(Boolean);
}
/** Seletor das 150 entradas. É registro de escolha, NÃO compra de Destino. */
export function TraitCatalogPicker({kind,value,onChange}:SelectorProps){
 const traits=CHARACTER_TRAITS.filter(t=>t.kind===kind);
 const [chosen,setChosen]=useState(traits[0]?.id??'');
 const [detail,setDetail]=useState('');
 const [message,setMessage]=useState('');
 const selected=traits.find(t=>t.id===chosen);
 const rule=selected?describeCharacterTrait(selected.id):null;
 const entries=splitEntries(value);
 const add=()=>{
  if(!selected)return;
  const parameter=detail.trim();
  const needsParameter=selected.parameterized;
  if(needsParameter&&!parameter){setMessage('Informe a habilidade do Defeito.');return;}
  const name=selected.parameterized?'Defeito ('+parameter+')':
   parameter?selected.label+': '+parameter:selected.label;
  if(entries.some(s=>s.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){
   setMessage('Esta característica já está registrada.');return;
  }
  onChange([...entries,name].join(';\n'));
  setMessage('Adicionado à ficha; exige conferência do Narrador para aplicar efeitos.');
  setDetail('');
 };
 return <section aria-label={kind==='benefit'?'Catálogo de Qualidades':'Catálogo de Defeitos'}
  className="rounded-lg border p-3 space-y-2">
  <h5 className="font-semibold">{kind==='benefit'?'Escolher qualidade':'Escolher defeito'} · {traits.length} opções do catálogo</h5>
  <label className="block">Catálogo completo
   <select value={chosen} onChange={e=>{setChosen(e.target.value);setMessage('');}}>
    {categories.filter(([key])=>kind==='flaw'?key==='flaw':key!=='flaw').map(([key,label])=>
     <optgroup key={key} label={label}>{traits.filter(x=>x.category===key).map(item=>
      <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup>)}
   </select>
  </label>
  {selected&&<div className="text-sm space-y-1" aria-live="polite">
   <p><strong>Efeito:</strong> {rule?.effectDescription}</p>
   <p><strong>Exigências:</strong> {rule?.prerequisiteDescription}</p>
   <p><strong>Automação:</strong> {rule?.automationStatus==='verified'?'Regra de cálculo catalogada; exige aprovação': 'Somente registro; regra pendente de homologação'}</p>
  </div>}
  {selected?.parameterized?
   <label className="block">Habilidade afetada
    <select value={detail} onChange={e=>setDetail(e.target.value)}>
     <option value="">Selecione</option>
     {CHARACTER_SKILL_IDS.map(id=><option key={id} value={CHARACTER_SKILL_LABELS[id]}>{CHARACTER_SKILL_LABELS[id]}</option>)}
    </select>
   </label>:
   <label className="block">Detalhe ou especialização (opcional)
    <input value={detail} onChange={e=>setDetail(e.target.value)} maxLength={140}
     placeholder="Ex.: Alquimia, Cajado de Magi"/>
   </label>}
  <button type="button" className="border rounded px-3 py-2" onClick={add} disabled={!selected}>
   Adicionar {kind==='benefit'?'qualidade':'defeito'}
  </button>
  <p role="status" className="text-sm">{message}</p>
  {entries.length>0&&<div aria-label="Características selecionadas" className="space-y-1">
   {entries.map((entry,i)=><div key={i} className="flex items-center justify-between gap-2 text-sm">
    <span>{entry}</span>
    <button type="button" className="border rounded px-2 py-1" onClick={()=>
     onChange(entries.filter((_,j)=>i!==j).join(';\n'))}
     aria-label={'Remover '+entry}>Remover</button>
   </div>)}
  </div>}
 </section>;
}
