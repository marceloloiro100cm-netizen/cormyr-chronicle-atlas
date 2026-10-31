import {useState} from 'react';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {TRAINING,UNIT_TYPES} from '@/lib/house/engine';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import {FORTUNE_TABLE,CONVERSIONS} from '@/lib/house/fortune';

/** Player-safe rules reference: no internal audit notes, errors, or private findings. */
export function HouseCodex(){
 const [query,setQuery]=useState('');
 const match=(value:string)=>value.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
 const entries=CORE_CATALOG.filter(item=>match([item.name,item.original,item.description,item.section].join(' ')));
 return <section className="house-panel"><h3>Regras e Tabelas · Códice da Casa Nobre</h3>
 <p>Consulta às regras do Livro Básico, Prosperidade e adaptações autorizadas de Cormyr. As observações documentais não substituem os pré-requisitos de compra.</p>
 <label>Pesquisar regra, posse ou atributo<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar no códice"/></label>
 {match('Recursos da Casa')&&<details className="house-ledger"><summary>Sete recursos da Casa</summary>{RESOURCE_KEYS.map(k=><p key={k}>{RESOURCE_NAMES[k]}</p>)}</details>}
 {match('Treinamento militar')&&<details className="house-ledger"><summary>Treinamento militar</summary>{Object.entries(TRAINING).map(([id,t])=><p key={id}>{t.name}: {t.power} Poder de treinamento, {t.xp} XP, Disciplina {t.discipline}</p>)}</details>}
 {match('Tipos de tropas')&&<details className="house-ledger"><summary>Tipos de tropas</summary>{UNIT_TYPES.map(x=><p key={x.id}><strong>{x.name}</strong>: +{x.cost} Poder, {x.description}</p>)}</details>}
 {match('Sorte da Casa')&&<details className="house-ledger"><summary>Tabela 6-18 · Sorte da Casa</summary>{FORTUNE_TABLE.map(([min,max,value],i)=><p key={i}>{Number.isFinite(min)?min:'até'}–{Number.isFinite(max)?max:'acima'}: {value}</p>)}</details>}
 {match('Conversões de recursos')&&<details className="house-ledger"><summary>Tabela 6-19 · Conversões básicas</summary>{Object.entries(CONVERSIONS).map(([from,targets])=><p key={from}>{RESOURCE_NAMES[from as keyof typeof RESOURCE_NAMES]}: {(targets??[]).map(t=>RESOURCE_NAMES[t]).join(', ')}</p>)}<p>As rotas especiais aparecem em Sorte e ações quando a posse correspondente estiver ativa.</p></details>}
 {match('Bônus regionais')&&<details className="house-ledger"><summary>Regiões de Cormyr</summary><p>O bônus regional é escolhido durante a criação da Casa. Fichas importadas não o recebem novamente.</p></details>}
 <h4>Catálogo de posses e Prosperidade ({entries.length})</h4>
 {entries.map(x=><details key={x.id} className="house-ledger"><summary>{x.name} · {x.original}</summary><p>{x.description}</p><p>Categoria: {x.category} · {x.source}, {x.section}</p><p>Preço: {x.costs.map(c=>c.amount+' '+RESOURCE_NAMES[c.resource]+' ('+(c.mode==='allocation'?'alocado':'permanente')+')').join(', ')||'Definido na regra'}</p>{x.effects.map((e,i)=><p key={i}>{e.description}</p>)}{x.pending&&<p className="house-caption">Nota documental: {x.pending}</p>}</details>)}
 {entries.length===0&&<p>Nenhuma regra encontrada.</p>}</section>;
}
