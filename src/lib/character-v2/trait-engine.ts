import {CHARACTER_SKILL_IDS,CharacterV2Schema,type CharacterSkillId,type CharacterV2} from './schema';
import {normalizeSpecialty} from './creation';
import {resolveCharacterDerived,type CharacterDerived,type DerivedContext,type MechanicalModifier} from './derived';
import {getCharacterTraitRule,type TraitEffectCode,CHARACTER_TRAIT_RULESET_VERSION} from './trait-rules';

export type TraitTestContext=Readonly<{
 activity:'combat'|'intrigue'|'exploration'|'other';
 skillId:CharacterSkillId;
 specialtyId?:string|undefined;
 opponentStatus?:number|undefined;
 targetCovered?:boolean|undefined;
 purpose?:'general'|'resist_disease'|'resist_hazard'|undefined;
}>;
export type TestEffect=Readonly<{
 sourceId:string;description:string;
 kind:'testDice'|'bonusDice'|'result'|'reroll';
 amount:number;face?:1|6|undefined;
 mandatory?:boolean|undefined;
}>;
export type TraitEvaluation=Readonly<{
 rulesVersion:typeof CHARACTER_TRAIT_RULESET_VERSION;
 modifiers:readonly MechanicalModifier[];
 runningMultiplier:{value:5;sourceId:string;approved:true}|null;
 tests:readonly TestEffect[];
 pending:readonly string[];
 applied:readonly string[];
 warnings:readonly string[];
}>;
const mod=(id:string,target:MechanicalModifier['target'],amount:number):MechanicalModifier=>({
 sourceId:'trait:'+id,description:'Qualidade ou desvantagem: '+id,
 target,amount,approved:true,active:true,stackKey:'trait:'+id+':'+target,kind:'rule',
});
const test=(id:string,kind:TestEffect['kind'],amount:number,description:string,
 face?:1|6,mandatory?:boolean):TestEffect=>({
 sourceId:'trait:'+id,description,kind,amount,...(face===undefined?{}:{face}),
 ...(mandatory===undefined?{}:{mandatory}),
});
function verifiedBonus(c:CharacterV2,skill:CharacterSkillId,specialty:string){
 return c.specialties.filter(s=>s.skillId===skill&&s.verified&&
  normalizeSpecialty(s.specialtyId)===specialty).reduce((best,s)=>Math.max(best,s.bonusDice),0);
}
function prerequisiteMet(c:CharacterV2,traitId:string):{ok:boolean;why:string[]}{
 const rule=getCharacterTraitRule(traitId),why:string[]=[];
 if(!rule)return{ok:false,why:['Qualidade não cadastrada.']};
 for(const requirement of rule.prerequisites){
  if(c.skillRanks[requirement.skill]<requirement.minimumRank)
   why.push('Exige '+requirement.skill+' '+requirement.minimumRank+'.');
  if(requirement.specialtyId&&verifiedBonus(c,requirement.skill,
   requirement.specialtyId)<(requirement.minimumBonusDice??1))
   why.push('Exige especialidade '+requirement.specialtyId+' verificada.');
 }
 if(rule.trait.tier!==null&&rule.trait.seriesId){
  for(let tier=1;tier<rule.trait.tier;tier++){
   const prior=c.traits.some(selection=>{
    const t=getCharacterTraitRule(selection.traitId)?.trait;
    return t?.seriesId===rule.trait.seriesId&&t?.tier===tier&&selection.status==='approved';
   });
   if(!prior)why.push('Grau '+tier+' anterior da mesma série não aprovado.');
  }
 }
 return{ok:why.length===0,why};
}
/** Resultados de contexto apenas; regras não verificadas nunca entram como modificadores. */
export function evaluateCharacterTraits(character:CharacterV2,
 context?:TraitTestContext):TraitEvaluation{
 const c=CharacterV2Schema.parse(character);
 const warnings:string[]=[],pending:string[]=[],applied:string[]=[];
 const modifiers:MechanicalModifier[]=[],tests:TestEffect[]=[];
 let runningMultiplier:TraitEvaluation['runningMultiplier']=null;
 const seen=new Set<string>();
 for(const selected of c.traits){
  if(selected.status==='inactive')continue;
  const rule=getCharacterTraitRule(selected.traitId);
  if(!rule){pending.push(selected.traitId+': não consta no catálogo.');continue;}
  const id=rule.trait.id;
  const selectedKey=id+':'+(rule.trait.parameterized?selected.params['skillId']??'': '');
  if(seen.has(selectedKey)){
   warnings.push(id+': seleção duplicada ignorada.');continue;
  }
  seen.add(selectedKey);
  if(c.review.status!=='approved'||selected.status!=='approved'){
   pending.push(id+': precisa de conciliação e aprovação do Narrador.');continue;
  }
  if(rule.status!=='verified'||rule.effect===null){
   pending.push(id+': efeito contextual/narrativo ou fonte ainda não validada.');continue;
  }
  const prereqs=prerequisiteMet(c,id);
  if(!prereqs.ok){pending.push(id+': '+prereqs.why.join(' '));continue;}
  if(rule.trait.kind==='flaw'&&rule.effect==='flawed_skill_dice'){
   const skill=selected.params['skillId'];
   if(!skill||!CHARACTER_SKILL_IDS.some(s=>s===skill)){
    pending.push(id+': especifique params.skillId com habilidade canônica.');continue;
   }
  }
  applied.push(id);
  const effect:TraitEffectCode=rule.effect;
  switch(effect){
   // Lotes 07/08: modificadores passivos, sem duplicar rank comprado.
   case 'fast_movement':
    modifiers.push(mod(id,'movement',1));
    runningMultiplier={value:5,sourceId:'trait:'+id,approved:true};break;
   case 'hardy_health':
    modifiers.push(mod(id,'maxHealth',verifiedBonus(c,'endurance','resistencia')));break;
   case 'stubborn_composure':
    modifiers.push(mod(id,'maxComposure',verifiedBonus(c,'will','dedicacao')));break;
   // Lote 09: nenhum defeito diminui permanentemente a graduação comprada.
   case 'limp_movement':modifiers.push(mod(id,'movement',-2));break;
   case 'short_movement_and_social':
    modifiers.push(mod(id,'movement',-1));break;
   case 'childhood_illness_health':
    modifiers.push(mod(id,'maxHealth',-2));break;
   default:break;
  }
  if(!context)continue;
  const sid=context.skillId,sp=normalizeSpecialty(context.specialtyId??'');
  const opponent=context.opponentStatus;
  switch(effect){
   // Habilidade, Fortuna e qualidades sociais em testes (sem alteração do rank).
   case 'agile_reroll':if(sid==='agility')tests.push(test(id,'reroll',0,'Rerrolar 1 em Agilidade',1,false));break;
   case 'attractive_reroll':if(sid==='persuasion')tests.push(test(id,'reroll',0,'Rerrolar 1 em Persuasão',1,false));break;
   case 'charismatic_result':if(sid==='persuasion')tests.push(test(id,'result',2,'+2 resultado em Persuasão'));break;
   case 'deceptive_result':if(sid==='deception')tests.push(test(id,'result',c.skillRanks.cunning,'Astúcia aplicada a Enganação'));break;
   case 'animal_friend_dice':if(sid==='animalHandling'&&['encantar','treinar'].includes(sp))
    tests.push(test(id,'testDice',1,'+1D Encantar/Treinar'));break;
   case 'precision_dice':if(sid==='marksmanship'&&context.targetCovered===true)
    tests.push(test(id,'testDice',1,'+1D Pontaria contra cobertura'));break;
   case 'noble_favorite_bonus':if(sid==='persuasion'&&opponent!==undefined&&opponent>=4)
    tests.push(test(id,'bonusDice',1,'+1B contra nobreza (Status ≥4)'));break;
   case 'common_favorite_bonus':if(sid==='persuasion'&&opponent!==undefined&&opponent<=3&&opponent>=0)
    tests.push(test(id,'bonusDice',1,'+1B contra plebe (Status ≤3)'));break;
   case 'short_movement_and_social':
    if(sid==='persuasion'&&['charme','seduzir'].includes(sp))
     tests.push(test(id,'testDice',-1,'-1D Charme/Seduzir'));break;
   case 'flawed_skill_dice':
    if(selected.params['skillId']===sid)tests.push(test(id,'testDice',-1,'Defeito na habilidade '+sid));break;
   case 'cowardice_dice':
    if(context.activity==='combat'||context.activity==='intrigue')
     tests.push(test(id,'testDice',-1,'Covarde durante combate/intriga'));break;
   case 'ignoble_dice':
    if(sid==='persuasion'||sid==='status')tests.push(test(id,'testDice',-1,'Ignóbil em Status/Persuasão'));break;
   case 'bastard_dice':
    if(sid==='persuasion'&&opponent!==undefined&&opponent>c.skillRanks.status)
     tests.push(test(id,'testDice',-1,'Bastardo contra Status maior'));break;
   case 'sickly_dice':
    if(sid==='endurance'&&['resist_disease','resist_hazard'].includes(context.purpose??'general'))
     tests.push(test(id,'testDice',-2,'Doente ao resistir doença/perigo'));break;
   case 'clumsy_reroll':if(sid==='agility')
    tests.push(test(id,'reroll',0,'Rerrolar 6 em Agilidade',6,true));break;
   case 'distracted_reroll':if(sid==='cunning')
    tests.push(test(id,'reroll',0,'Rerrolar 6 em Astúcia',6,true));break;
   case 'scarred_reroll':if(sid==='persuasion')
    tests.push(test(id,'reroll',0,'Rerrolar 6 em Persuasão',6,true));break;
   default:break;
  }
 }
 return{rulesVersion:CHARACTER_TRAIT_RULESET_VERSION,modifiers,runningMultiplier,
  tests,pending,applied,warnings};
}
/**
 * Interliga efeitos comprovados ao resolver do lote 05. Apenas as regras
 * de trait geram seus modificadores. context.equipment é pré-validado pelo
 * chamador autorizado — nenhuma integração de servidor acontece aqui.
 */
export function resolveCharacterWithTraits(character:CharacterV2,options:{
 equipment?:DerivedContext['equipment'];test?:TraitTestContext;
}={}):{derived:CharacterDerived;traits:TraitEvaluation}{
 const traits=evaluateCharacterTraits(character,options.test);
 const context:DerivedContext={
  modifiers:traits.modifiers,
  ...(options.equipment===undefined?{}:{equipment:options.equipment}),
  ...(traits.runningMultiplier===null?{}:{runningMultiplier:traits.runningMultiplier}),
 };
 return {derived:resolveCharacterDerived(character,context),traits};
}
