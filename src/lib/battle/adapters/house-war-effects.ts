import {activeHoldings} from '@/lib/house/engine';
import {unitMilitaryBonuses,type MilitaryBonusLine} from '@/lib/house/military-bonuses';
import type {HouseState,Unit} from '@/lib/house/types';

/** Proveniência fechada e conservadora para os efeitos da Casa na guerra.
 * A ficha oficial é a única fonte de modificadores automáticos.
 * O catálogo de heráldica, a história e rosters NPC são fontes narrativas, NÃO
 * registros numéricos de posse nem autorização para conceder vantagens.
 */
export type HouseWarEffectAudit=Readonly<{
 houseId:string;unitId:string;source:'official-house-sheet';
 /** Bônus permanentes de habilidade e dano que o motor do livro já aplica. */
 automatic:readonly Readonly<{holdingId:string;description:string}>[];
 /** Somente usar Defesa da fortificação se a unidade realmente ocupar a área no campo. */
 deferredFortDefense:number;
 /** Bônus suplementar depende de defesa na fortificação e conferência pelo Narrador. */
 deferredFortArmor:number;
 /** A Tabela 10-6 pode aplicar +1, SEM alterar o estado da Casa. */
 masterOfArmsSurvivorBonus:0|1;
 /** Efeitos cuja aplicação requer dados do combate, personagem ou autorização. */
 narratorReview:readonly string[];
}>;

const readable=(row:MilitaryBonusLine)=>row.source+' · '+row.description;
export function auditHouseWarEffects(state:HouseState,unit:Unit):HouseWarEffectAudit{
 if(state.houseId.length===0||!state.units.some(row=>row.id===unit.id))
  throw new Error('Unidade não pertence à ficha militar auditada.');
 const bonuses=unitMilitaryBonuses(state,unit);
 const masterOfArms=activeHoldings(state).some(h=>h.itemId==='pros-master-of-arms');
 const automatic=bonuses.entries.filter(e=>e.kind==='combat'&&
  (/^Habilidade /.test(e.description)||
   /(?:dano corpo a corpo|Armas de Luta: dano|Armas de Pontaria: dano|Cães de Guerra equipados)/.test(e.description)))
  .map(e=>({holdingId:e.holdingId,description:readable(e)}));
 const narratorReview=[
  ...bonuses.entries.filter(e=>
   e.kind!=='combat'||(!automatic.some(a=>a.holdingId===e.holdingId)&&
    !/^(Defesa de fortificação|Defesa em fortificação|Absorção de Armadura)/.test(e.description)))
   .map(readable),
  ...bonuses.conditional.map(readable),
  ...(bonuses.defense>0?[
   'Defesa de fortificação +'+bonuses.defense+
   ' somente quando houver posição defensiva verificada no tabuleiro; nunca somar à Defesa base.'
  ]:[]),
  ...(bonuses.armorRating>0?[
   'Armadura de preparação para cerco +'+bonuses.armorRating+
   ' requer fortificação e regra suplementar confirmadas; não aplicar fora dela.'
  ]:[]),
  'Qualidades, Benefícios e Desvantagens dos personagens/comandantes exigem ficha individual e verificação de condições; nunca inferir da narrativa.',
 ];
 return {houseId:state.houseId,unitId:unit.id,source:'official-house-sheet',
  automatic,deferredFortDefense:bonuses.defense,
  deferredFortArmor:bonuses.armorRating,
  masterOfArmsSurvivorBonus:masterOfArms?1:0,
  narratorReview:[...new Set(narratorReview)]};
}

export type NpcWarReadiness='full-sheet'|'training-proposal'|'unavailable';
export type NpcWarPreflight=Readonly<{
 readiness:NpcWarReadiness;autoHouseModifiersAllowed:boolean;
 missingEvidence:readonly string[];
}>;
/** Fontes NPC não estruturadas jamais são promovidas a regras fiéis ao livro. */
export function assessNpcWarReadiness(input:{
 hasFullSheet:boolean;hasScenarioRoster:boolean;
}):NpcWarPreflight{
 if(input.hasFullSheet)return {readiness:'full-sheet',
  autoHouseModifiersAllowed:true,missingEvidence:[]};
 if(input.hasScenarioRoster)return {readiness:'training-proposal',
  autoHouseModifiersAllowed:false,missingEvidence:[
   'Ficha militar completa e conferida (Saúde, Defesa, Disciplina, equipamentos e habilidades).',
   'Posse ativa vinculada ao domínio e ao posicionamento da unidade.',
   'Qualidades, Benefícios e Desvantagens com fonte e aprovação do Narrador.',
  ]};
 return {readiness:'unavailable',autoHouseModifiersAllowed:false,
  missingEvidence:['Ficha militar e roster da Casa ausentes.']};
}
