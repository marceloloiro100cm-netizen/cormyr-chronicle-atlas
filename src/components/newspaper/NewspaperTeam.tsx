import {StaffPhoto} from './NewspaperStaff';
import {type NewspaperStaffMember} from '@/lib/newspaper/model';

/** Visão do jogador: a equipe da Redação cadastrada pelo Editor-Chefe, somente leitura. */
export function NewspaperTeam({staff,loading=false}:{staff:NewspaperStaffMember[];loading?:boolean}){
 if(!loading&&staff.length===0)return null;
 return <section className="folha-team" aria-label="Conheça Nossa Equipe">
  <header>
   <p className="newspaper-kicker">A REDAÇÃO</p>
   <h3>Conheça Nossa Equipe</h3>
  </header>
  {loading?<p role="status">Carregando a equipe…</p>:
   <ul className="folha-team-list">{staff.map(m=><li key={m.id} className="folha-team-card">
    <StaffPhoto path={m.photo_path} name={m.name}/>
    <div>
     <strong>{m.name}</strong>
     {m.specialty.trim()&&<span className="folha-team-role">{m.specialty}</span>}
     {m.bio.trim()&&<p>{m.bio}</p>}
    </div>
   </li>)}</ul>}
 </section>;
}
