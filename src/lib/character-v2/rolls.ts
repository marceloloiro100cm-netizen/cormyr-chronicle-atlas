import {z} from 'zod';
import {type CharacterV2,type CharacterSkillId,CharacterV2Schema} from './schema';
import {normalizeSpecialty} from './creation';
import {evaluateCharacterTraits,type TraitTestContext} from './trait-engine';

const DiceSchema=z.number().int().min(1).max(6);
export const RollInputSchema=z.object({
 context:z.object({
  activity:z.enum(['combat','intrigue','exploration','other']),
  skillId:z.string(),specialtyId:z.string().optional(),
  opponentStatus:z.number().int().min(0).max(10).optional(),
  targetCovered:z.boolean().optional(),
  purpose:z.enum(['general','resist_disease','resist_hazard']).optional(),
 }),
 dice:z.array(DiceSchema).max(40),
 /** rerolagens substituem um dado existente; cada índice só pode ser usado uma vez */
 rerolls:z.array(z.object({index:z.number().int().min(0).max(39),newFace:DiceSchema})).max(40).default([]),
 difficulty:z.number().int().min(0).max(1000),
});
export type CharacterRollResult=Readonly<{
 rank:number;testDice:number;bonusDice:number;rolled:readonly number[];
 kept:readonly number[];total:number;difficulty:number;success:boolean;
 lines:readonly {source:string;description:string;amount:number}[];
 warnings:readonly string[];pending:readonly string[];
}>;
/** Deterministic evaluator: caller supplies every die face, and must not trust player-originated dice. */
export function evaluateCharacterRoll(c:CharacterV2,raw:z.input<typeof RollInputSchema>):CharacterRollResult{
 const character=CharacterV2Schema.parse(c);
 const request=RollInputSchema.parse(raw);
 const skillId=request.context.skillId as CharacterSkillId;
 if(!(skillId in character.skillRanks))throw new Error('Habilidade desconhecida.');
 const context=request.context as TraitTestContext;
 const trait=evaluateCharacterTraits(character,context);
 const rank=character.skillRanks[skillId];
 const specialty=character.specialties.filter(s=>s.verified&&s.skillId===skillId&&
  normalizeSpecialty(s.specialtyId)===normalizeSpecialty(request.context.specialtyId??''))
  .reduce((n,s)=>Math.max(n,s.bonusDice),0);
 const addedDice=trait.tests.filter(t=>t.kind==='testDice').reduce((sum,t)=>sum+t.amount,0);
 const bonus=trait.tests.filter(t=>t.kind==='bonusDice').reduce((sum,t)=>sum+t.amount,0);
 const resultBonus=trait.tests.filter(t=>t.kind==='result').reduce((sum,t)=>sum+t.amount,0);
 const testDice=Math.max(0,rank+addedDice);
 const bonusDice=Math.max(0,specialty+bonus);
 if(testDice+bonusDice>40)throw new Error('Rolagem excede limite de dados.');
 if(request.dice.length!==testDice+bonusDice)
  throw new Error('Quantidade de faces não coincide com os dados D/B.');
 const availableRerolls=trait.tests.filter(t=>t.kind==='reroll');
 const faces=[...request.dice],touched=new Set<number>(),warnings:string[]=[];
 for(const reroll of request.rerolls){
  if(touched.has(reroll.index))throw new Error('Dado não pode ser rerrolado duas vezes.');
  const prior=faces[reroll.index];
  if(prior===undefined)throw new Error('Índice de dado inválido.');
  if(!availableRerolls.some(rule=>rule.face===prior))
   throw new Error('Rerrolagem sem regra ou resultado compatível.');
  touched.add(reroll.index);faces[reroll.index]=reroll.newFace;
 }
 // Desvantagens com rerrolagem obrigatória: é preciso fornecer as faces de substituição.
 for(const effect of availableRerolls.filter(t=>t.mandatory)){
  if(faces.some((face,index)=>face===effect.face&&!touched.has(index)))
   throw new Error('Rerrolagem obrigatória ainda não resolvida: '+effect.description);
 }
 const kept=[...faces].sort((a,b)=>b-a).slice(0,testDice);
 const total=kept.reduce((a,b)=>a+b,0)+resultBonus;
 const lines=[
  {source:'skill:'+skillId,description:'Dados de teste da habilidade',amount:rank},
  {source:'specialty:'+normalizeSpecialty(request.context.specialtyId??''),description:'Dados de bônus verificados',amount:specialty},
  ...trait.tests.map(x=>({source:x.sourceId,description:x.description,amount:x.amount})),
 ];
 if(character.state.conditions.length||character.state.injuries.length||character.state.wounds.length)
  warnings.push('Condições importadas aguardam conciliação; esta rolagem não inclui efeitos não tipados.');
 return {rank,testDice,bonusDice,rolled:faces,kept,total,difficulty:request.difficulty,
  success:total>=request.difficulty,lines,warnings,pending:trait.pending};
}
export function prepareCharacterRollDice(c:CharacterV2,context:TraitTestContext){
 const character=CharacterV2Schema.parse(c);
 const traits=evaluateCharacterTraits(character,context);
 const rank=character.skillRanks[context.skillId];
 const specialty=character.specialties.filter(s=>s.verified&&s.skillId===context.skillId&&
  normalizeSpecialty(s.specialtyId)===normalizeSpecialty(context.specialtyId??''))
 .reduce((n,s)=>Math.max(n,s.bonusDice),0);
 const dice=Math.max(0,rank+traits.tests.filter(x=>x.kind==='testDice').reduce((n,x)=>n+x.amount,0));
 const bonus=Math.max(0,specialty+traits.tests.filter(x=>x.kind==='bonusDice').reduce((n,x)=>n+x.amount,0));
 return{testDice:dice,bonusDice:bonus,expectedRolls:dice+bonus};
}
