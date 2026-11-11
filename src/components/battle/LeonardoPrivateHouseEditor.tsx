import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {
 DEFAULT_PRIVATE_HOUSE,SIM_UNIT_TYPES,SIM_TRAINING,
 loadPrivateHouse,savePrivateHouse,deletePrivateHouse,
 type PrivateHouse,
} from '@/lib/battle/leonardo-private-house';

export function LeonardoPrivateHouseEditor({userId,house,onChange}:{
 userId:string;house:PrivateHouse|null;onChange:(next:PrivateHouse|null)=>void;
}){
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState<PrivateHouse>(house??DEFAULT_PRIVATE_HOUSE);
 const [message,setMessage]=useState('');
 const open=()=>{
  const current=typeof window!=='undefined'?loadPrivateHouse(window.localStorage,userId):null;
  setDraft(current??DEFAULT_PRIVATE_HOUSE);setEditing(true);setMessage('');
 };
 const change=(field:'name'|'region'|'motto'|'description',value:string)=>
  setDraft(d=>({...d,[field]:value}));
 const updateUnit=(index:number,patch:Partial<PrivateHouse['units'][number]>)=>
  setDraft(current=>{
   const units=current.units.map((u,i)=>i===index?{...u,...patch}:u);
   return {...current,units:units as unknown as PrivateHouse['units']};
  });
 const save=()=>{
  try{
   const next=savePrivateHouse(window.localStorage,userId,draft);
   onChange(next);setEditing(false);setMessage('Casa de simulação salva neste navegador.');
  }catch(e){setMessage(e instanceof Error?e.message:'Revise os campos da casa.');}
 };
 return <section className="battle-surface" aria-label="Minha casa de simulação">
  <h2>Minha casa de simulação</h2>
  <p className="battle-note">Crie uma casa fictícia com quatro tropas personalizadas.
   Ela fica salva somente neste navegador, vinculada à sua conta, e pode participar
   de batalhas no modo Adaptado. Não entra nas Casas oficiais da segunda temporada.</p>
  {house&&!editing&&<>
   <h3>{house.name}</h3>
   <p>{house.region}{house.motto?' · '+house.motto:''}</p>
   <p>{house.description}</p>
   <div className="crusade-model-roster">
    {house.units.map((u,i)=><span key={i}>{u.name} · {u.count} combatentes</span>)}
   </div>
  </>}
  {!editing?<div className="battle-home-actions">
   <Button onClick={open}>{house?'Editar minha casa':'Criar minha casa'}</Button>
   {house&&<Button variant="outline" onClick={()=>{
    if(!window.confirm('Excluir a casa fictícia deste navegador?'))return;
    deletePrivateHouse(window.localStorage,userId);
    onChange(null);setMessage('Casa fictícia excluída.');
   }}>Excluir casa</Button>}
  </div>:<form className="campaign-form" onSubmit={e=>{e.preventDefault();save();}}>
   <label>Nome da casa<input value={draft.name} maxLength={80} required
    onChange={e=>change('name',e.target.value)}/></label>
   <label>Região fictícia<input value={draft.region} maxLength={80} required
    onChange={e=>change('region',e.target.value)}/></label>
   <label>Lema<input value={draft.motto} maxLength={120}
    onChange={e=>change('motto',e.target.value)}/></label>
   <label>História ou descrição<textarea value={draft.description} maxLength={500}
    onChange={e=>change('description',e.target.value)}/></label>
   <h3>Exército-modelo</h3>
   {draft.units.map((unit,i)=><fieldset key={i} className="battle-surface">
    <legend>Tropa {i+1}</legend>
    <label>Nome da tropa<input required maxLength={80} value={unit.name}
     onChange={e=>updateUnit(i,{name:e.target.value})}/></label>
    <label>Tipo<select value={unit.typeId}
     onChange={e=>updateUnit(i,{typeId:e.target.value})}>
     {SIM_UNIT_TYPES.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
    <label>Quantidade<input type="number" min={1} max={1000} required
     value={unit.count} onChange={e=>updateUnit(i,{count:Number(e.target.value)})}/></label>
    <label>Treinamento<select value={unit.training}
     onChange={e=>updateUnit(i,{training:e.target.value as PrivateHouse['units'][number]['training']})}>
      {SIM_TRAINING.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
   </fieldset>)}
   <div className="battle-home-actions">
    <Button type="submit">Salvar casa fictícia</Button>
    <Button type="button" variant="outline" onClick={()=>setEditing(false)}>Cancelar</Button>
   </div>
  </form>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
