import type {ReactNode} from 'react';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {HouseMark,Icon} from './narrator-ui';

type CouncilHouse={id:string;name:string;crest:string|null;lord_name:string|null;castle:string|null;region:string|null};
type CouncilPlayer={id:string;name:string;active:boolean;roster_house_id:string|null};

/**
 * Conselho das casas do Narrador: as Casas jogadoras pelos grupos de narração,
 * com atalhos para as missivas e a ficha de cada uma, seguidas da
 * administração da Casa selecionada (conteúdo original do Conselho).
 */
export function NarratorCouncil({houses,players,onOpenMail,onOpenSheet,children}:{
 houses:CouncilHouse[];players:CouncilPlayer[];
 onOpenMail:(houseId:string)=>void;onOpenSheet:(houseId:string)=>void;children:ReactNode;
}){
 const ids=houses.map(h=>h.id);
 const grouped=new Set<string>();
 const groups:{id:string;label:string;houses:CouncilHouse[]}[]=NARRATION_GROUPS.map(g=>{
  const members=narrationHouseIds(g.id,ids);members.forEach(id=>grouped.add(id));
  return {id:g.id,label:g.label,houses:members.map(id=>houses.find(h=>h.id===id)!).filter(Boolean)};
 });
 const others=houses.filter(h=>!grouped.has(h.id));
 if(others.length)groups.push({id:'outras',label:'Outras Casas da temporada',houses:others});
 const playerOf=(houseId:string)=>players.filter(p=>p.active&&p.roster_house_id===houseId).map(p=>p.name).join(', ');
 return <div className="nw-council">
  <p className="nw-eyebrow">Segunda Temporada · Conselho</p>
  <h1 className="nw-title">Conselho do mestre</h1>
  <p className="nw-lead">As Casas jogadoras pelos grupos de narração. Abra as missivas ou a ficha de uma Casa direto daqui.</p>
  {groups.filter(g=>g.houses.length>0).map(g=><section key={g.id} aria-label={g.label}>
   <h2 className="nw-group-title">{g.label}</h2>
   <div className="nw-house-grid">
    {g.houses.map(h=>{const player=playerOf(h.id);return <article key={h.id} className="nw-house-card">
     <div className="nw-house-head"><HouseMark house={h} size="lg"/>
      <div><h3>Casa {h.name}</h3><p>{player?'Jogador: '+player:'Sem jogador vinculado'}</p></div></div>
     <dl className="nw-facts">
      {h.lord_name&&<><dt>Lorde</dt><dd>{h.lord_name}</dd></>}
      {h.castle&&<><dt>Sede</dt><dd>{h.castle}</dd></>}
      {h.region&&<><dt>Região</dt><dd>{h.region}</dd></>}
     </dl>
     <div className="nw-house-actions">
      <button type="button" className="nw-btn nw-btn--sm" aria-label={'Abrir missivas da Casa '+h.name} onClick={()=>onOpenMail(h.id)}>
       <Icon name="missivas" size={15}/>Missivas</button>
      <button type="button" className="nw-btn nw-btn--sm" aria-label={'Abrir ficha da Casa '+h.name} onClick={()=>onOpenSheet(h.id)}>
       <Icon name="file" size={15}/>Ficha</button>
     </div>
    </article>;})}
   </div>
  </section>)}
  <h2 className="nw-group-title" id="nw-house-admin">Administração da Casa</h2>
  <div className="nw-council-admin">{children}</div>
 </div>;
}
