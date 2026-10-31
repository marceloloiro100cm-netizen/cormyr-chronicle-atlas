import {useEffect,useState} from 'react';
import {BookOpen,Download,Coins,Swords,GraduationCap,AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {TRAINING,UNIT_TYPES,unitStats,activeHoldings} from '@/lib/house/engine';
import {UNIT_EQUIPMENT} from '@/lib/house/equipment';
import {unitMilitaryBonuses} from '@/lib/house/military-bonuses';
import {unitAllowedSkills,unitXpSummary,XP_PER_RANK} from '@/lib/house/unit-progression';
import {SKILLS,SKILL_NAMES,EXTRA_UNIT_SKILLS,UNIT_SKILLS,UNIT_SKILL_NAMES,type Unit,type HouseState,type ExtraUnitSkill,type UnitSkill,type Skill} from '@/lib/house/types';
import {MilitaryUnitSymbol,unitSymbolType} from './military-unit-symbol';
import {exportUnitPdf} from '@/lib/house/unit-export';

type Actions={unit:Unit;state:HouseState;houseName:string;canEdit:boolean;admin:boolean;busy:boolean;
 onEdit:(args:Record<string,unknown>)=>Promise<boolean>;
 onGrant:(args:Record<string,unknown>,reason:string)=>Promise<boolean>;
 onEquipment:(args:Record<string,unknown>)=>Promise<boolean>;
 onWarHounds?:(args:Record<string,unknown>)=>Promise<boolean>;
 onBroadTraining?:(args:Record<string,unknown>)=>Promise<boolean>;};
export function UnitSheet({unit,state,houseName,canEdit,admin,busy,onEdit,onGrant,onEquipment,onWarHounds,onBroadTraining}:Actions){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState(false);
 const [name,setName]=useState(unit.name),[origin,setOrigin]=useState(unit.origin),[situation,setSituation]=useState(unit.situation),[notes,setNotes]=useState(unit.notes);
 const [skills,setSkills]=useState(unit.skills),[extraSkills,setExtraSkills]=useState(unit.extraSkills??{}),[mount,setMount]=useState(unit.mount);
 const [xpGift,setXpGift]=useState(20),[xpReason,setXpReason]=useState(''),[broadSkill,setBroadSkill]=useState<Skill>('warfare');
 useEffect(()=>{setSkills(unit.skills);setExtraSkills(unit.extraSkills??{});setName(unit.name);setOrigin(unit.origin);setSituation(unit.situation);setNotes(unit.notes);setMount(unit.mount);},[unit]);
 const current=unitXpSummary(unit),allowed=unitAllowedSkills(unit);
 const spent=SKILLS.reduce((sum,k)=>sum+Math.max(0,skills[k]-2)*XP_PER_RANK,0)+EXTRA_UNIT_SKILLS.reduce((sum,k)=>sum+Math.max(0,(extraSkills[k]??2)-2)*XP_PER_RANK,0);
 const future=current.total-spent,stats=unitStats(unit,state),preview=unitStats({...unit,skills,mount},state);
 const military=unitMilitaryBonuses(state,unit),row=UNIT_EQUIPMENT.find(r=>r.id===(unit.equipmentTypeId??unit.types[0]));
 const master=activeHoldings(state).some(h=>h.itemId==='pros-master-of-arms');
 const lastLoss=[...(unit.xpEvents??[])].reverse().find(e=>e.delta<0);
 async function save(){
  const ok=await onEdit({unitId:unit.id,name,origin,situation,notes,skills,extraSkills,mount});
  if(ok)setEditing(false);
 }
 return <>
 <Button type="button" size="sm" variant="outline" onClick={()=>setOpen(true)} aria-label={'Ver ficha gráfica de '+unit.name}><BookOpen size={15}/> Ver ficha</Button>
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="military-sheet max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-8">
  <DialogHeader>
   <div className="military-sheet-heading">
    <MilitaryUnitSymbol typeId={unitSymbolType(unit.types,unit.equipmentTypeId)} />
    <div className="military-sheet-header-title">
     <p className="campaign-eyebrow">CASA {houseName.toLocaleUpperCase('pt-BR')} · FICHA DE UNIDADE</p>
     <DialogTitle className="text-3xl font-serif">{unit.name}</DialogTitle>
     <DialogDescription>{unit.types.map(id=>UNIT_TYPES.find(t=>t.id===id)?.name??id).join(' / ')} · {TRAINING[unit.training as keyof typeof TRAINING]?.name} · {unit.commanderName||'Sem comandante'}</DialogDescription>
    </div>
    <Button className="military-sheet-download" type="button" variant="outline" title={'Baixar PDF da unidade '+unit.name} onClick={()=>void exportUnitPdf(unit,state,houseName)}>
     <Download size={17}/> Baixar ficha (PDF)
    </Button>
   </div>
  </DialogHeader>
  <div className="military-sheet-stats">
   <div><span>Defesa</span><strong>{editing?preview.defense:stats.defense}</strong></div>
   <div><span>Saúde</span><strong>{stats.health}/{editing?preview.maxHealth:stats.maxHealth}</strong></div>
   <div><span>Disciplina</span><strong>{stats.discipline}</strong></div>
   <div><span>Movimento</span><strong>{stats.movement} m</strong></div>
   <div><span>Armadura</span><strong>{stats.armorRating}</strong></div>
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
  {canEdit&&!unit.destroyed&&<Button type="button" className="military-sheet-edit" variant="outline" onClick={()=>setEditing(v=>!v)}>{editing?'Cancelar edição':'Editar ficha e habilidades'}</Button>}
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
   <div className="military-skills">{UNIT_SKILLS.map(skill=>{
    const extended=EXTRA_UNIT_SKILLS.includes(skill as ExtraUnitSkill);
    const original=extended?(unit.extraSkills?.[skill as ExtraUnitSkill]??2):unit.skills[skill as Skill];
    const value=editing?(extended?(extraSkills[skill as ExtraUnitSkill]??2):skills[skill as Skill]):original+(!extended?(military.skillBonuses[skill as Skill]??0):0);
    const permitted=allowed.has(skill),canIncrease=permitted&&value<12;
    const choose=(n:number)=>{
     if(n<2)return;
     if(n>original&&!permitted)return;
     if(extended)setExtraSkills(prev=>({...prev,[skill]:n}));
     else setSkills(prev=>({...prev,[skill]:n}));
    };
    return <div key={skill} className="military-skill">
     <div className="military-skill-head"><strong>{UNIT_SKILL_NAMES[skill as UnitSkill]}</strong><span>{value}{!permitted&&<small> · sem especialização</small>}</span></div>
     <div className="military-skill-pips" aria-label={UNIT_SKILL_NAMES[skill as UnitSkill]+': graduação '+value}>
      {Array.from({length:12},(_,i)=>i+1).map(rank=>editing?<button type="button" key={rank}
       aria-label={UNIT_SKILL_NAMES[skill as UnitSkill]+' graduação '+rank} aria-pressed={rank<=value}
       disabled={busy||rank===1||(rank>original&&!canIncrease)} className={'military-pip '+(rank<=value?'filled':'')}
       onClick={()=>choose(rank)} title={UNIT_SKILL_NAMES[skill as UnitSkill]+' '+rank}/>:<span key={rank} aria-hidden="true" className={'military-pip '+(rank<=value?'filled':'')}/>)}
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
   {(military.fightingDamage>0||military.marksmanshipDamage>0)&&<p className="military-positive">Dano da Casa: Luta +{military.fightingDamage} / Pontaria +{military.marksmanshipDamage}.</p>}
   {master&&!unit.equipment.length&&<p className="military-positive">Mestre de Armas: primeira melhoria gratuita para esta unidade. Escolha o equipamento abaixo.</p>}
   {master&&unit.equipment.length>0&&<p>Mestre de Armas ativo: bônus de sobrevivência +1 é aplicado automaticamente.</p>}
   {canEdit&&!unit.destroyed&&<div className="military-equip-buttons">{(['armor','fighting','marksmanship'] as const).map(category=><Button key={category} type="button" size="sm" variant="outline"
    disabled={busy||unit.equipment.includes(category)||!row||(category==='marksmanship'&&row.improved.marksmanship==='—')}
    onClick={()=>void onEquipment({unitId:unit.id,category})}>
    {unit.equipment.includes(category)?'✓ ':''}Melhorar {category==='armor'?'Armadura':category==='fighting'?'Armas de Luta':'Armas de Pontaria'} · {master&&!unit.equipment.length?'Grátis':'1 Riqueza'}
   </Button>)}</div>}
  </section>
  {canEdit&&!unit.destroyed&&!unit.warHoundsHoldingId&&!unit.types.includes('warships')&&
    !(unit.types.includes('cavalry')&&unit.mounted!==false)&&
    state.holdings.filter(h=>h.status==='active'&&h.itemId==='pros-dog-kennels--war-hounds').map(h=>
     <Button type="button" key={h.id} size="sm" variant="outline" disabled={busy||!onWarHounds}
      onClick={()=>void onWarHounds?.({unitId:unit.id,holdingId:h.id})}>
      Equipar Cães de Guerra · 2 Riqueza
     </Button>)}
  {canEdit&&!unit.destroyed&&!unit.broadTrainingSkill&&onBroadTraining&&
   state.holdings.some(h=>h.status==='active'&&h.itemId==='pros-military-academy--broad-training')&&
   <form className="campaign-form" onSubmit={e=>{e.preventDefault();void onBroadTraining({unitId:unit.id,skill:broadSkill});}}>
    <label>Treinamento Amplo — quarta habilidade da unidade
     <select value={broadSkill} onChange={e=>setBroadSkill(e.target.value as Skill)}>
      {SKILLS.filter(id=>!allowed.has(id)).map(id=><option key={id} value={id}>{SKILL_NAMES[id]}</option>)}
     </select>
    </label>
    <Button disabled={busy||allowed.has(broadSkill)}>Aplicar ação da Casa</Button>
   </form>}
  <section><h3 className="font-serif text-xl">História e condição</h3>
   <p>Origem: {unit.origin||'Não identificada'} · Situação: {unit.situation||'Não informada'}</p>
   <p>Comandante: {unit.commanderName||'Não designado'} · Baixas: {unit.casualties} · Domínio: {state.domains.find(d=>d.id===unit.domainId)?.name||'Não localizado'}</p>
   {unit.notes&&<p>{unit.notes}</p>}
   {unit.mount&&<p>Montaria: {unit.mount.name} · Atletismo {unit.mount.athletics} · Vigor {unit.mount.endurance}</p>}
  </section>
  {(military.entries.length>0||military.conditional.length>0)&&<section className="military-unit-bonuses">
   <h3 className="font-serif text-xl">Bônus de construções e posses militares</h3>
   {military.entries.map((entry,i)=><p key={entry.holdingId+'-'+i}><strong>{entry.source}:</strong> {entry.description}</p>)}
   {military.conditional.length>0&&<details><summary>Benefícios que exigem escolha ou condição</summary>{military.conditional.map((entry,i)=><p key={entry.holdingId+'-'+i}>{entry.source}: {entry.description}</p>)}</details>}
  </section>}
 </DialogContent>
 </Dialog>
 </>;
}
