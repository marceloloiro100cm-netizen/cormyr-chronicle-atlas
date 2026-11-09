/** Cadastro V2 de criatura original do Narrador, somente no banco privado.
 * A fonte dos 300 monstros não é modificada e não vai para o repositório.
 */
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {saveDndCustomMonster} from '@/lib/crusade/dnd-private-custom';
import {feetToDndMetres,dndMetresToFeet} from '@/lib/crusade/dnd-metric';
import {parseDndCustomMonster,type DndCormyrGroup}
 from '@/lib/crusade/dnd-cormyr-300';
import {crzDamageTypeSchema} from '@/lib/crusade/creatures';
const groups:DndCormyrGroup[]=['Dragões','Goblinoides','Humanoides',
 'Constructos','Mortos-vivos'];
const sizeOptions=['T','S','M','L','H','G'] as const;
type State={
 id:string;name:string;group:DndCormyrGroup;source:string;
 challenge_rating:number;hp:number;ac:number;size:typeof sizeOptions[number];
 speed_ft:number;fly_ft:string;dex_mod:string;
 mode:'melee'|'ranged';attack_name:string;bonus:number;damage:string;
 damage_type:string;
};
export function DndCustomMonsterEditor({onSaved}:{
 onSaved:()=>Promise<void>;
}){
 const [draft,setDraft]=useState<State>({
  id:'custom-',name:'',group:'Humanoides',source:'Criação do Narrador',
  challenge_rating:1,hp:10,ac:12,size:'M',speed_ft:30,
  fly_ft:'',dex_mod:'',mode:'melee',attack_name:'Ataque básico',
  bonus:2,damage:'1d6',damage_type:'bludgeoning',
 });
 const [saving,setSaving]=useState(false);
 const [confirmedAuthorship,setConfirmedAuthorship]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const change=<K extends keyof State>(key:K,value:State[K])=>
  setDraft(prev=>({...prev,[key]:value}));
 const save=async()=>{
  if(!confirmedAuthorship){
   setError('Confirme autoria ou permissão de uso antes de cadastrar.');
   return;
  }
  setSaving(true);setError('');setMessage('');
  try{
   const attack={
    name:draft.attack_name,bonus:draft.bonus,damage:draft.damage,
    damage_type:crzDamageTypeSchema.parse(draft.damage_type),
    ...(draft.mode==='ranged'?{range_ft:null}:{}),
   };
   const record=parseDndCustomMonster({
    id:draft.id.trim().toLowerCase(),name:draft.name.trim(),
    group:draft.group,source:draft.source.trim(),
    challenge_rating:draft.challenge_rating,hp:draft.hp,ac:draft.ac,
    size:draft.size,speed_ft:draft.speed_ft,
    ...(draft.fly_ft.trim()!==''?{fly_ft:Number(draft.fly_ft)}:{}),
    ...(draft.dex_mod.trim()!==''?{dex_mod:Number(draft.dex_mod)}:{}),
    melee:draft.mode==='melee'?attack:null,
    ranged:draft.mode==='ranged'?attack:null,
   });
   await saveDndCustomMonster(record);
   await onSaved();
   setMessage('Criatura original salva no catálogo privado V2.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a ficha.');}
  finally{setSaving(false);}
 };
 return <details className="battle-surface" aria-label="Nova criatura privada D&D">
  <summary>Adicionar criatura original ao catálogo privado</summary>
  <p className="battle-note">Crie somente conteúdo próprio ou autorizado. O ID precisa
   iniciar com custom-. Ataques à distância não possuem teto de alcance.</p>
  <div className="dnd-cormyr-filters">
   <label>ID único
    <input aria-label="ID nova criatura D&D" value={draft.id}
     onChange={e=>change('id',e.target.value)}/></label>
   <label>Nome
    <input aria-label="Nome nova criatura D&D" value={draft.name}
     onChange={e=>change('name',e.target.value)}/></label>
   <label>Grupo
    <select value={draft.group} aria-label="Grupo nova criatura D&D"
     onChange={e=>change('group',e.target.value as DndCormyrGroup)}>
     {groups.map(g=><option key={g} value={g}>{g}</option>)}
    </select>
   </label>
   <label>Fonte ou autoria
    <input value={draft.source} aria-label="Fonte nova criatura D&D"
     onChange={e=>change('source',e.target.value)}/></label>
   <label>ND
    <input type="number" min={0} max={30} step={0.125} value={draft.challenge_rating}
     aria-label="ND nova criatura D&D"
     onChange={e=>change('challenge_rating',Number(e.target.value))}/></label>
   <label>PV
    <input type="number" min={1} value={draft.hp} aria-label="PV nova criatura D&D"
     onChange={e=>change('hp',Number(e.target.value))}/></label>
   <label>CA
    <input type="number" min={1} max={40} value={draft.ac}
     aria-label="CA nova criatura D&D" onChange={e=>change('ac',Number(e.target.value))}/></label>
   <label>Tamanho
    <select value={draft.size} aria-label="Tamanho nova criatura D&D"
     onChange={e=>change('size',e.target.value as State['size'])}>
     {sizeOptions.map(size=><option key={size} value={size}>{size}</option>)}
    </select>
   </label>
   <label>Deslocamento terrestre em metros
    <input type="number" min={0} max={300} step={0.5} value={feetToDndMetres(draft.speed_ft)}
     aria-label="Deslocamento nova criatura D&D"
     onChange={e=>change('speed_ft',dndMetresToFeet(Number(e.target.value)))}/></label>
   <label>Voo em metros (vazio = não definido)
    <input type="number" min={0} max={300} step={0.5}
     value={draft.fly_ft===''?'':feetToDndMetres(Number(draft.fly_ft))}
     aria-label="Voo nova criatura D&D"
     onChange={e=>change('fly_ft',e.target.value===''?'':String(
      dndMetresToFeet(Number(e.target.value))))}/></label>
   <label>Modificador DES (opcional)
    <input type="number" min={-10} max={30} value={draft.dex_mod}
     aria-label="DES nova criatura D&D"
     onChange={e=>change('dex_mod',e.target.value)}/></label>
   <label>Tipo de ataque
    <select value={draft.mode} aria-label="Modo de ataque nova criatura D&D"
     onChange={e=>change('mode',e.target.value as State['mode'])}>
     <option value="melee">Corpo a corpo</option>
     <option value="ranged">À distância (sem limite)</option>
    </select>
   </label>
   <label>Nome do ataque
    <input value={draft.attack_name} aria-label="Nome do ataque D&D"
     onChange={e=>change('attack_name',e.target.value)}/></label>
   <label>Bônus de ataque
    <input type="number" min={-30} max={60} value={draft.bonus}
     aria-label="Bônus do ataque D&D"
     onChange={e=>change('bonus',Number(e.target.value))}/></label>
   <label>Dano
    <input value={draft.damage} aria-label="Dano da nova criatura D&D"
     onChange={e=>change('damage',e.target.value)}/></label>
   <label>Tipo de dano
    <select value={draft.damage_type} aria-label="Tipo de dano da nova criatura D&D"
     onChange={e=>change('damage_type',e.target.value)}>
     {crzDamageTypeSchema.options.map(t=><option key={t} value={t}>{t}</option>)}
    </select>
   </label>
  </div>
  <label className="battle-note">
   <input type="checkbox" aria-label="Confirmar autoria ou autorização D&D"
    checked={confirmedAuthorship}
    onChange={e=>setConfirmedAuthorship(e.target.checked)}/>
   Confirmo que esta ficha foi criada por mim ou possui autorização para uso privado.
  </label>
  {error&&<p className="crz-alert" role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  <Button disabled={saving||!confirmedAuthorship} onClick={()=>void save()}>
   Salvar criatura original</Button>
 </details>;
}
