import {useId,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {HouseState,Unit} from '@/lib/house/types';

type CommanderRecord={id:string;title:string};
type Props={
 unit:Unit;
 court:HouseState['court'];
 commanders:CommanderRecord[];
 canEdit:boolean;
 busy:boolean;
 onAssign:(args:Record<string,unknown>)=>Promise<boolean>;
};

/**
 * Share one assignment workflow between the military unit card and its sheet.
 * The existing unit_state operation commits the change and atomically creates
 * a house-visible NPC + Court link if the entered commander does not exist.
 */
export function UnitCommanderAssignment({unit,court,commanders,canEdit,busy,onAssign}:Props){
 const formId=useId();
 const candidates=court.flatMap(member=>{
  const existing=member.npcId?commanders.find(n=>n.id===member.npcId):undefined;
  const name=existing?.title??(!member.npcId?member.name:'');
  return name?.trim()?[{id:member.id,name:name.trim(),role:member.role}]:[];
 }).filter((person,index,all)=>all.findIndex(other=>other.name.toLocaleLowerCase('pt-BR')===person.name.toLocaleLowerCase('pt-BR'))===index);
 const [open,setOpen]=useState(false);
 const [mode,setMode]=useState<'court'|'new'>('court');
 const [selected,setSelected]=useState('');
 const [newName,setNewName]=useState('');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const allowed=canEdit&&!busy&&!unit.destroyed;
 const label=unit.commanderName?.trim()||'Sem comandante';
 const target=mode==='court'?candidates.find(p=>p.id===selected)?.name??'':newName.trim();
 const valid=target.length>0&&target.length<=160&&target!==unit.commanderName;

 async function assign(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!valid||saving||!allowed)return;
  setError('');setSaving(true);
  try{
   const success=await onAssign({
    unitId:unit.id,
    commanderName:target,
    domainId:unit.domainId,
    mounted:unit.mounted!==false,
    atHome:unit.atHome!==false,
    health:unit.health,
    casualties:unit.casualties,
    situation:unit.situation,
    disband:false
   });
   if(success){setOpen(false);setSelected('');setNewName('');}
   else setError('Não foi possível atribuir o comandante. Consulte o aviso da ficha.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível atribuir o comandante.');}
  finally{setSaving(false);}
 }
 return <span className="military-commander-control">
  {canEdit&&!unit.destroyed?
   <button type="button" className="military-commander-trigger"
    aria-controls={formId} aria-expanded={open} disabled={busy||saving}
    title={unit.commanderName?'Trocar comandante da unidade':'Designar comandante da unidade'}
    onClick={()=>{setOpen(v=>!v);setError('');}}>
    <strong>{label}</strong>
   </button>:
   <strong className="military-commander-readonly">{label}</strong>}
  {open&&canEdit&&!unit.destroyed&&<form id={formId} className="military-commander-editor" onSubmit={e=>void assign(e)}>
   <strong>Designar comandante</strong>
   <div className="military-commander-modes" role="group" aria-label="Origem do comandante">
    <Button type="button" size="sm" variant={mode==='court'?'default':'outline'}
     aria-pressed={mode==='court'} onClick={()=>{setMode('court');setError('');}}>Escolher da Corte</Button>
    <Button type="button" size="sm" variant={mode==='new'?'default':'outline'}
     aria-pressed={mode==='new'} onClick={()=>{setMode('new');setError('');}}>Criar novo</Button>
   </div>
   {mode==='court'?<label>Integrante da Corte
    <select aria-label="Integrante da Corte" value={selected} onChange={e=>setSelected(e.target.value)}>
     <option value="">Selecione um integrante</option>
     {candidates.map(person=><option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
    </select>
    {candidates.length===0&&<small>Nenhum integrante cadastrado. Use “Criar novo”.</small>}
   </label>:
   <label>Nome do novo comandante
    <input aria-label="Nome do novo comandante" value={newName} onChange={e=>setNewName(e.target.value)}
     maxLength={160} required autoComplete="off" placeholder="Nome do comandante"/>
    <small>Ao confirmar, o comandante será criado na Corte da Casa e vinculado à unidade.</small>
   </label>}
   {error&&<p className="house-warning" role="alert">{error}</p>}
   <div className="campaign-actions">
    <Button type="submit" size="sm" disabled={!allowed||saving||!valid}>{saving?'Salvando…':'Confirmar comandante'}</Button>
    <Button type="button" size="sm" variant="outline" onClick={()=>{setOpen(false);setError('');}}>Cancelar</Button>
   </div>
  </form>}
 </span>;
}
