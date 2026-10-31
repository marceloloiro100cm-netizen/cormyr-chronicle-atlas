import {useEffect,useState} from 'react';
import {BookOpen,Shield,Coins,Swords,GraduationCap,AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {TRAINING,UNIT_TYPES,unitStats,activeHoldings} from '@/lib/house/engine';
import {UNIT_EQUIPMENT,houseWeaponBonuses} from '@/lib/house/equipment';
import {unitAllowedSkills,unitXpSummary,XP_PER_RANK} from '@/lib/house/unit-progression';
import {SKILLS,SKILL_NAMES,type Unit,type HouseState,type Skill} from '@/lib/house/types';

type Actions={unit:Unit;state:HouseState;canEdit:boolean;admin:boolean;busy:boolean;
 onEdit:(args:Record<string,unknown>)=>Promise<boolean>;
 onGrant:(args:Record<string,unknown>,reason:string)=>Promise<boolean>;
 onEquipment:(args:Record<string,unknown>)=>Promise<boolean>};
export function UnitSheet({unit,state,canEdit,admin,busy,onEdit,onGrant,onEquipment}:Actions){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState(false);
 const [name,setName]=useState(unit.name),[origin,setOrigin]=useState(unit.origin),[situation,setSituation]=useState(unit.situation),[notes,setNotes]=useState(unit.notes);
 const [skills,setSkills]=useState(unit.skills),[mount,setMount]=useState(unit.mount);
 const [xpGift,setXpGift]=useState(20),[xpReason,setXpReason]=useState('');
 useEffect(()=>{setSkills(unit.skills);setName(unit.name);setOrigin(unit.origin);setSituation(unit.situation);setNotes(unit.notes);setMount(unit.mount);},[unit]);
 const current=unitXpSummary(unit),allowed=unitAllowedSkills(unit);
 const spent=SKILLS.reduce((sum,k)=>sum+Math.max(0,skills[k]-2)*XP_PER_RANK,0);
 const future=current.total-spent,stats=unitStats(unit),preview=unitStats({...unit,skills,mount});
 const bonuses=houseWeaponBonuses(state),row=UNIT_EQUIPMENT.find(r=>r.id===(unit.equipmentTypeId??unit.types[0]));
 const master=activeHoldings(state).some(h=>h.itemId==='pros-master-of-arms');
 const lastLoss=[...(unit.xpEvents??[])].reverse().find(e=>e.delta<0);
 async function save(){
  const ok=await onEdit({unitId:unit.id,name,origin,situation,notes,skills,mount});
  if(ok)setEditing(false);
 }
 return <>
 <Button type="button" size="sm" variant="outline" onClick={()=>setOpen(true)} aria-label={'Ver ficha gráfica de '+unit.name}><BookOpen size={15}/> Ver ficha</Button>
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="military-sheet max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-8">
  <DialogHeader>
   <div className="military-sheet-heading"><div className="military-sheet-emblem"><Shield size={38}/></div><div>
    <p className="campaign-eyebrow">CORMYR · FICHA DE UNIDADE</p>
    <DialogTitle className="text-3xl font-serif">{unit.name}</DialogTitle>
    <DialogDescription>{unit.types.map(id=>UNIT_TYPES.find(t=>t.id===id)?.name??id).join(' / ')} · {TRAINING[unit.training as keyof typeof TRAINING]?.name} · {unit.commanderName||'Sem comandante'}</DialogDescription>
   </div></div>
  </DialogHeader>
  <div className="military-sheet-stats">
   <div><span>Defesa</span><strong>{editing?preview.defense:stats.defense}</strong></div>
   <div><span>Saúde</span><strong>{stats.health}/{editing?preview.maxHealth:stats.maxHealth}</strong></div>
   <div><span>Disciplina</span><strong>{stats.discipline}</strong></div>
   <div><span>Movimento</span><strong>{stats.movement} m</strong></div>
   <div><span>Armadura</span><strong>{unit.armor}</strong></div>
   <div><span>Efetivo</span><strong>{Math.max(0,unit.strength-unit.casualties)}/{unit.strength}</strong></div>
  </div>
  <section className="military-sheet-xp">
   <div><GraduationCap size={20}/><strong>Experiência independente do treinamento</strong></div>
   <p>Treinamento: {current.training} XP · Bônus do Narrador e ajustes históricos: {current.bonus>=0?'+':''}{current.bonus} XP · Investidos: {current.spent} XP</p>
   <p className={current.deficit?'military-xp-loss':'military-xp-available'}>{current.deficit?
    'Déficit: '+current.deficit+' XP — reduza habilidades, sem perda automática de graduações':
    'XP livre: '+current.available}</p>
   {lastLoss&&<p className="military-xp-loss" role="alert"><AlertTriangle size={16}/> Perdeu {Math.abs(lastLoss.delta)} XP com o treinamento ({lastLoss.reason}). {current.deficit?'Há atributos para reduzir.':'Orçamento atualmente regularizado.'}</p>}
   {admin&&!unit.destroyed&&<form className="military-xp-grant" onSubmit={async e=>{e.preventDefault();if(await onGrant({unitId:unit.id,amount:xpGift,reason:xpReason},xpReason))setXpReason('');}}>
     <label>XP de recompensa do Narrador<input type="number" min={1} max={1000} value={xpGift} onChange={e=>setXpGift(Number(e.target.value))}/></label>
     <label>Justificativa auditada<input required minLength={10} maxLength={1000} placeholder="Ex.: Recompensa pela defesa da fortaleza" value={xpReason} onChange={e=>setXpReason(e.target.value)}/></label>
     <Button disabled={busy||xpReason.trim().length<10}><Coins size={15}/> Conceder XP</Button>
    </form>}
   {(unit.xpEvents??[]).length>0&&<details><summary>Histórico de experiência</summary>
    {[...(unit.xpEvents??[])].reverse().slice(0,20).map(e=><p key={e.id} className={e.delta<0?'military-xp-loss':''}>{e.delta>0?'+':''}{e.delta} XP · {e.kind==='award'?'Recompensa':'Treinamento'} · {e.reason}</p>)}
   </details>}
  </section>
  {canEdit&&!unit.destroyed&&<Button type="button" variant="outline" onClick={()=>setEditing(v=>!v)}>{editing?'Cancelar edição':'Editar ficha e habilidades'}</Button>}
  {editing&&canEdit&&<div className="military-sheet-form">
   <div className="house-input-grid">
    <label>Nome da unidade<input maxLength={160} required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Origem / quartel<input maxLength={160} value={origin} onChange={e=>setOrigin(e.target.value)}/></label>
    <label>Situação<input maxLength={1000} value={situation} onChange={e=>setSituation(e.target.value)}/></label>
   </div>
   <label>Observações e especialidades narrativas<textarea maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   {unit.types.includes('cavalry')&&<fieldset><legend>Montaria</legend>
     <label>Nome<input value={mount?.name??''} onChange={e=>setMount(m=>({...m!,name:e.target.value}))}/></label>
     <label>Atletismo<input type="number" min={1} max={12} value={mount?.athletics??2} onChange={e=>setMount(m=>({...m!,athletics:Number(e.target.value)}))}/></label>
     <label>Vigor<input type="number" min={1} max={12} value={mount?.endurance??2} onChange={e=>setMount(m=>({...m!,endurance:Number(e.target.value)}))}/></label>
     <label>Fonte<input value={mount?.source??''} onChange={e=>setMount(m=>({...m!,source:e.target.value}))}/></label>
    </fieldset>}
  </div>}
  <section><h3 className="font-serif text-xl mb-2">Habilidades · 20 XP por graduação</h3>
   <p className="text-sm text-muted-foreground mb-3">Todas as habilidades aparecem na ficha. Aumentos estão disponíveis somente nas habilidades permitidas pelo tipo da unidade (ou adaptação aprovada para tipos mistos).</p>
   <div className="military-skills">{SKILLS.map(skill=>{
    const original=unit.skills[skill],value=editing?skills[skill]:original;
    const permitted=allowed.has(skill),canIncrease=permitted&&value<12;
    const choose=(n:number)=>{if(n>original&&!permitted)return;setSkills(prev=>({...prev,[skill]:n}));};
    return <div key={skill} className="military-skill">
     <div className="military-skill-head"><strong>{SKILL_NAMES[skill]}</strong><span>{value}{!permitted&&<small> · sem especialização</small>}</span></div>
     <div className="military-skill-pips" aria-label={SKILL_NAMES[skill]+': graduação '+value}>
      {Array.from({length:11},(_,i)=>i+2).map(rank=>editing?<button type="button" key={rank}
       aria-label={SKILL_NAMES[skill]+' graduação '+rank} aria-pressed={rank<=value}
       disabled={busy||(rank>original&&!canIncrease)} className={'military-pip '+(rank<=value?'filled':'')}
       onClick={()=>choose(rank)} title={SKILL_NAMES[skill]+' '+rank}/>:<span key={rank} aria-hidden="true" className={'military-pip '+(rank<=value?'filled':'')}/>)}
     </div>
    </div>;
   })}</div>
   {editing&&<div className={'military-sheet-spend '+(future<0?'military-xp-loss':'')}>
    XP na edição: {spent} investidos · {future>=0?future+' disponíveis':'déficit de '+Math.abs(future)+': reduza habilidades'}
    <Button disabled={busy||!name.trim()||(future<0&&spent>=current.spent)}
     onClick={()=>void save()}>Salvar ficha e distribuição de XP</Button>
   </div>}
  </section>
  <section className="military-equipment"><h3 className="font-serif text-xl"><Swords size={19}/> Equipamentos e bônus</h3>
   <p>Conjunto: {UNIT_TYPES.find(t=>t.id===(unit.equipmentTypeId??unit.types[0]))?.name??'Não identificado'}</p>
   {row?<div className="military-sheet-stats">
    <div><span>Armadura</span><strong>{unit.equipment.includes('armor')?row.improved.armor:row.initial.armor}</strong></div>
    <div><span>Penalidade</span><strong>{unit.equipment.includes('armor')?row.improved.penalty:row.initial.penalty}</strong></div>
    <div><span>Volume</span><strong>{unit.equipment.includes('armor')?row.improved.bulk:row.initial.bulk}</strong></div>
    <div><span>Luta</span><strong className="military-attack">{unit.equipment.includes('fighting')?row.improved.fighting:row.initial.fighting}</strong></div>
    <div><span>Pontaria</span><strong className="military-attack">{unit.equipment.includes('marksmanship')?row.improved.marksmanship:row.initial.marksmanship}</strong></div>
   </div>:<p>Conjunto de equipamento sem tabela; revisão necessária.</p>}
   {(bonuses.fighting>0||bonuses.marksmanship>0)&&<p className="military-positive">Bônus da Casa: +{bonuses.fighting} Luta / +{bonuses.marksmanship} Pontaria.</p>}
   {master&&!unit.equipment.length&&<p className="military-positive">Mestre de Armas: primeira melhoria gratuita para esta unidade. Escolha o equipamento abaixo.</p>}
   {master&&unit.equipment.length>0&&<p>Mestre de Armas ativo: bônus de sobrevivência +1 é aplicado automaticamente.</p>}
   {canEdit&&!unit.destroyed&&<div className="military-equip-buttons">{(['armor','fighting','marksmanship'] as const).map(category=><Button key={category} type="button" size="sm" variant="outline"
    disabled={busy||unit.equipment.includes(category)||!row||(category==='marksmanship'&&row.improved.marksmanship==='—')}
    onClick={()=>void onEquipment({unitId:unit.id,category})}>
    {unit.equipment.includes(category)?'✓ ':''}Melhorar {category==='armor'?'Armadura':category==='fighting'?'Armas de Luta':'Armas de Pontaria'} · {master&&!unit.equipment.length?'Grátis':'1 Riqueza'}
   </Button>)}</div>}
  </section>
  <section><h3 className="font-serif text-xl">História e condição</h3>
   <p>Origem: {unit.origin||'Não identificada'} · Situação: {unit.situation||'Não informada'}</p>
   <p>Comandante: {unit.commanderName||'Não designado'} · Baixas: {unit.casualties} · Domínio: {state.domains.find(d=>d.id===unit.domainId)?.name||'Não localizado'}</p>
   {unit.notes&&<p>{unit.notes}</p>}
   {unit.mount&&<p>Montaria: {unit.mount.name} · Atletismo {unit.mount.athletics} · Vigor {unit.mount.endurance}</p>}
  </section>
 </DialogContent>
 </Dialog>
 </>;
}
