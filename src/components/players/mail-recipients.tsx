import {useState} from 'react';
import type {Panel} from './panel-data';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';

type Props={
  data:Panel;
  me:Panel['players'][number]|undefined;
  targets:string[];
  onChange:(targets:string[])=>void;
};

type GroupId='dragon-coast'|'horselands'|'other';
type House=Panel['houses'][number];

const GROUPS:{id:GroupId;label:string}[]=[
  {id:'dragon-coast',label:'Dragon Coast'},
  {id:'horselands',label:'Horselands'},
  {id:'other',label:'Outras regiões (verificar cadastro)'},
];

/** Campaign-house region can be absent even when the official character sheet
 * identifies a house's region. These four assignments are confirmed by the
 * campaign roster and are intentionally scoped to the second-season houses. */
const CONFIRMED_DRAGON_COAST=new Set(['ashkar','fewmerry','goldfin','grantass']);

export function recipientHouseRegion(house:Pick<House,'id'|'region'>):GroupId {
  const value=(house.region??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s_-]+/g,'');
  if(CONFIRMED_DRAGON_COAST.has(house.id.toLowerCase()))return 'dragon-coast';
  if(value.includes('dragoncoast')||value.includes('costadodragao'))return 'dragon-coast';
  if(value.includes('horseland'))return 'horselands';
  // Do not silently add houses from unrelated regions to a Dragon Coast mass mailing.
  return 'other';
}

/** Only noble houses may receive new correspondence. */
export function MailRecipientPicker({data,me,targets,onChange}:Props){
  const selected=new Set(targets);
  const [query,setQuery]=useState('');
  const eligibleHouses=data.houses.filter(h=>h.active&&h.season===2&&
    (data.admin||!data.members.some(m=>m.player_id===me?.id&&m.house_id===h.id)));
  const selectedCount=targets.filter(t=>t.startsWith('h:')).length;
  const cleanQuery=query.trim().toLocaleLowerCase('pt-BR');
  function toggleHouse(id:string){
    const token='h:'+id;
    onChange(selected.has(token)?targets.filter(t=>t!==token):[...targets,token]);
  }
  function toggleAll(houses:House[]){
    const allSelected=houses.every(h=>selected.has('h:'+h.id));
    const tokens=new Set(houses.map(h=>'h:'+h.id));
    onChange(allSelected?targets.filter(t=>!tokens.has(t)):[...new Set([...targets,...tokens])]);
  }
  return <fieldset className="mail-recipient-picker">
    <legend>Destinatários <span className="mail-recipient-count">{selectedCount} casa(s) selecionada(s)</span></legend>
    <div className="mail-recipient-toolbar">
      <label className="mail-recipient-search">Buscar casa
        <input type="search" value={query} placeholder="Nome da casa" onChange={e=>setQuery(e.target.value)}/>
      </label>

    </div>

    {data.admin&&<div className="campaign-actions" aria-label="Seleção rápida dos grupos de narração">
      {NARRATION_GROUPS.map(group=><button type="button" key={group.id}
        onClick={()=>onChange(narrationHouseIds(group.id,eligibleHouses.map(h=>h.id)).map(id=>'h:'+id))}>
        Selecionar {group.label}
      </button>)}
      <button type="button" onClick={()=>onChange(eligibleHouses.map(h=>'h:'+h.id))}>Selecionar todas as casas</button>
      <button type="button" onClick={()=>onChange([])}>Limpar seleção</button>
    </div>}
    <div className="mail-recipient-regions">
      {GROUPS.map(group=>{
        const houses=eligibleHouses.filter(h=>recipientHouseRegion(h)===group.id)
          .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
        if(group.id==='other'&&!houses.length)return null;
        const marked=houses.filter(h=>selected.has('h:'+h.id)).length;
        const allSelected=houses.length>0&&marked===houses.length;
        const partlySelected=marked>0&&!allSelected;
        const visible=houses.filter(h=>!cleanQuery||h.name.toLocaleLowerCase('pt-BR').includes(cleanQuery));
        return <section key={group.id} className={'mail-recipient-region'+(group.id==='other'?' mail-recipient-other':'')}
          aria-label={'Destinatários de '+group.label}>
          <div className="mail-recipient-region-head">
            <h3>{group.label}</h3>
            <span className="mail-recipient-count">{marked} de {houses.length} casas</span>
          </div>
          <label className="mail-recipient-option mail-recipient-select-all">
            <input type="checkbox" checked={allSelected} disabled={houses.length===0}
              ref={node=>{if(node)node.indeterminate=partlySelected;}}
              onChange={()=>toggleAll(houses)}
              aria-label={'Selecionar todas as casas de '+group.label}/>
            <span>Selecionar todas as casas da região</span>
          </label>
          <div className="mail-recipient-scroll">
            {visible.map(h=><label key={h.id} className="mail-recipient-option mail-recipient-house-label">
              <input type="checkbox" checked={selected.has('h:'+h.id)} onChange={()=>toggleHouse(h.id)}/>
              <span>{h.name}</span>
            </label>)}
            {!visible.length&&<p className="mail-recipient-empty">{houses.length?'Nenhuma casa corresponde à busca.':'Nenhuma casa disponível nesta região.'}</p>}
          </div>
        </section>;
      })}
    </div>
    <p className="mail-recipient-help">Marque uma região inteira ou escolha somente as casas desejadas. A seleção regional inclui todas as casas elegíveis mesmo com a busca ativa. Cada entrega continua privada.</p>
  </fieldset>;
}
