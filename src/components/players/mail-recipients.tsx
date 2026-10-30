import {useState} from 'react';
import type {Panel} from './panel-data';

type Player = {id:string;name:string;houses:string[]};
type RecipientOptions = {players:Player[]};
type Props = {
  data:Panel;
  options:RecipientOptions|undefined;
  me:Panel['players'][number]|undefined;
  targets:string[];
  onChange:(targets:string[])=>void;
};

const GROUPS = [
  {id:'dragon-coast',label:'Dragon Coast'},
  {id:'horselands',label:'Horselands'},
  {id:'other',label:'Outras regiões / sem vínculo'},
] as const;

function regionKey(name:string|null|undefined) {
  const normalized=(name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
  return normalized.includes('dragon coast')?'dragon-coast':normalized.includes('horselands')?'horselands':'other';
}

/** The picker changes only the existing p:/h:/narrator recipient tokens.
 * A house target already includes its authorized members, so do not also
 * select an individual player of that house in the same batch.
 */
export function MailRecipientPicker({data,options,me,targets,onChange}:Props){
  const [search,setSearch]=useState('');
  const selected=new Set(targets);
  const allHouses=data.houses;
  const eligibleHouses=allHouses.filter(h=>h.active&&h.season===2&&
    (data.admin||!data.members.some(m=>m.player_id===me?.id&&m.house_id===h.id)));
  const players=(options?.players??[]).filter(p=>p.id!==me?.id);
  const groupOf=(houseId:string)=>regionKey(allHouses.find(h=>h.id===houseId)?.region);
  const primaryHouse=(p:Player)=>{
    const known=p.houses.filter(id=>allHouses.some(h=>h.id===id));
    return known.find(id=>groupOf(id)!=='other')??known[0]??null;
  };
  const assignments=players.map(p=>({player:p,houseId:primaryHouse(p)}));
  const query=search.trim().toLocaleLowerCase('pt-BR');
  const matches=(p:Player)=>!query||[p.name,...p.houses.map(id=>allHouses.find(h=>h.id===id)?.name??id)]
    .join(' ').toLocaleLowerCase('pt-BR').includes(query);
  const togglePlayer=(player:Player)=>{
    const token='p:'+player.id;
    const next=new Set(targets);
    if(next.has(token))next.delete(token);
    else {
      next.add(token);
      // A direct recipient replaces a previously selected house target.
      player.houses.forEach(id=>next.delete('h:'+id));
    }
    onChange([...next]);
  };
  const toggleHouse=(id:string)=>{
    const token='h:'+id;
    const next=new Set(targets);
    if(next.has(token))next.delete(token);
    else {
      next.add(token);
      players.filter(p=>p.houses.includes(id)).forEach(p=>next.delete('p:'+p.id));
    }
    onChange([...next]);
  };
  const toggleRegion=(houseIds:string[])=>{
    const next=new Set(targets);
    const allSelected=houseIds.every(id=>next.has('h:'+id));
    if(allSelected)houseIds.forEach(id=>next.delete('h:'+id));
    else {
      houseIds.forEach(id=>next.add('h:'+id));
      players.filter(p=>p.houses.some(id=>houseIds.includes(id)))
        .forEach(p=>next.delete('p:'+p.id));
    }
    onChange([...next]);
  };

  return <fieldset className="mail-recipient-picker">
    <legend>Destinatários <span className="mail-recipient-count">{targets.length} selecionado(s)</span></legend>
    <div className="mail-recipient-toolbar">
      <label className="mail-recipient-search">Buscar pessoa ou casa
        <input type="search" value={search} placeholder="Nome da pessoa ou casa" onChange={e=>setSearch(e.target.value)}/>
      </label>
      {!data.admin&&<label className="mail-recipient-option mail-recipient-narrator">
        <input type="checkbox" checked={selected.has('narrator')} onChange={()=>onChange(selected.has('narrator')?targets.filter(x=>x!=='narrator'):[...targets,'narrator'])}/>
        <span>Narrador</span>
      </label>}
    </div>
    <div className="mail-recipient-regions">
      {GROUPS.map(group=>{
        const houses=allHouses.filter(h=>regionKey(h.region)===group.id);
        const available=eligibleHouses.filter(h=>regionKey(h.region)===group.id);
        const groupPlayers=assignments.filter(a=>a.houseId!==null&&groupOf(a.houseId)===group.id);
        const noHouse=group.id==='other'?assignments.filter(a=>!a.houseId):[];
        const rows=houses.filter(h=>available.some(a=>a.id===h.id)||groupPlayers.some(a=>a.houseId===h.id));
        const any=rows.length>0||noHouse.length>0;
        if(group.id==='other'&&!any)return null;
        const allSelected=available.length>0&&available.every(h=>selected.has('h:'+h.id));
        const count=available.filter(h=>selected.has('h:'+h.id)).length+
          groupPlayers.filter(a=>selected.has('p:'+a.player.id)).length;
        return <section key={group.id} className={'mail-recipient-region '+(group.id==='other'?'mail-recipient-other':'')} aria-label={'Destinatários de '+group.label}>
          <div className="mail-recipient-region-head">
            <h3>{group.label}</h3>
            <span className="mail-recipient-count">{count} marcados</span>
          </div>
          <button type="button" className="mail-recipient-region-action" disabled={!available.length}
            aria-pressed={allSelected} onClick={()=>toggleRegion(available.map(h=>h.id))}>
            {allSelected?'Desmarcar região':'Selecionar região inteira'}
          </button>
          <div className="mail-recipient-scroll">
            {rows.map(h=>{
              const allowed=available.some(a=>a.id===h.id);
              const people=groupPlayers.filter(a=>a.houseId===h.id&&matches(a.player));
              const houseMatches=!query||h.name.toLocaleLowerCase('pt-BR').includes(query);
              if(!houseMatches&&!people.length)return null;
              return <div className="mail-recipient-house" key={h.id}>
                <label className="mail-recipient-option mail-recipient-house-label">
                  {allowed&&<input type="checkbox" checked={selected.has('h:'+h.id)} onChange={()=>toggleHouse(h.id)}/>}
                  <span>{h.name}</span>
                  {allowed&&<small>Casa inteira</small>}
                </label>
                {people.map(({player})=><label className="mail-recipient-option mail-recipient-person" key={player.id}>
                  <input type="checkbox" checked={selected.has('p:'+player.id)} onChange={()=>togglePlayer(player)}/>
                  <span>{player.name}</span>
                </label>)}
              </div>;
            })}
            {noHouse.filter(a=>matches(a.player)).map(({player})=><label key={player.id} className="mail-recipient-option mail-recipient-person">
              <input type="checkbox" checked={selected.has('p:'+player.id)} onChange={()=>togglePlayer(player)}/>
              <span>{player.name} <small>Sem casa identificada</small></span>
            </label>)}
            {!any&&<p className="mail-recipient-empty">Nenhum destinatário nesta região.</p>}
          </div>
        </section>;
      })}
    </div>
    <p className="mail-recipient-help">Selecione a região para enviar às casas autorizadas daquela região, marque “Casa inteira” para uma casa ou escolha pessoas individualmente. As entregas continuam privadas por destinatário.</p>
  </fieldset>;
}
