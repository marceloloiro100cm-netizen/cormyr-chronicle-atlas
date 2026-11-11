import type {WarAftermathPreview,WarSurvivorProposal} from './aftermath';
import type {WarBattle,WarSide} from './types';

/** Convocação oficial: transforma o resultado de uma batalha ENCERRADA em um
 * plano de lançamentos para as fichas das Casas. Este módulo é puro: apenas
 * descreve o que o Narrador poderá confirmar. A gravação acontece em outro
 * lugar, pela operação transacional `survivors` da ficha, restrita ao Narrador.
 * Tropas-modelo nunca geram lançamentos.
 */
export type WarConvocationEntry=Readonly<{
 houseId:string;unitId:string;unitName:string;side:WarSide;
 /** d6 bruto da Tabela 10-6; o bônus de Mestre de Armas é recalculado pela ficha. */
 roll:number;condition:WarSurvivorProposal['condition'];disorganizations:number;
 /** Versão da ficha copiada no início da batalha, para detectar mudanças. */
 sourceVersion:number|null;
 projectedTraining:WarSurvivorProposal['proposedTraining'];
 training:WarSurvivorProposal['training'];
 /** Chaves determinísticas: repetir a confirmação não duplica perdas. */
 operationKey:string;evolutionId:string;
 justification:string;
}>;
export type WarConvocationPlan=Readonly<{
 battleId:string;battleName:string;
 houses:readonly Readonly<{houseId:string;entries:readonly WarConvocationEntry[]}>[];
 modelUnits:number;officialUnits:number;
 glory:Readonly<Record<WarSide,number>>;
}>;
function hash32(text:string,salt:number):number{
 let h=(2166136261^salt)>>>0;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
 // Mistura final para espalhar entradas parecidas.
 h^=h>>>16;h=Math.imul(h,2246822507)>>>0;h^=h>>>13;h=Math.imul(h,3266489909)>>>0;
 return (h^(h>>>16))>>>0;
}
/** UUID estável (formato v4) derivado de texto: mesma batalha e unidade, mesma chave. */
export function stableWarUuid(text:string):string{
 const hex=[11,23,37,53].map(salt=>hash32(text,salt).toString(16).padStart(8,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-'+
  '89ab'[parseInt(hex[16]!,16)%4]+hex.slice(17,20)+'-'+hex.slice(20,32);
}
const CONDITION_LABEL:Record<WarSurvivorProposal['condition'],string>={
 unharmed:'sem dano',damaged:'com dano',disorganized:'desorganizada',
 routed:'debandada',destroyed:'destruída',
};
export function buildWarConvocationPlan(battle:WarBattle,aftermath:WarAftermathPreview,
 label?:string):WarConvocationPlan{
 if(battle.phase!=='finished')throw new Error('A convocação só pode ser lançada com a batalha encerrada.');
 if(aftermath.battleId!==battle.id)throw new Error('O resultado não pertence a esta batalha.');
 const name=(label??battle.name).trim().slice(0,120)||battle.name;
 const byHouse=new Map<string,WarConvocationEntry[]>();
 let modelUnits=0,officialUnits=0;
 for(const unit of battle.units){
  const source=unit.source;
  if(source.kind!=='house-readonly'||!source.houseId||!source.unitId){modelUnits++;continue;}
  const row=aftermath.survivors.find(s=>s.unitId===unit.id);
  if(!row)throw new Error('Unidade oficial sem resultado de sobreviventes: '+unit.name);
  officialUnits++;
  // A semente final e o número de eventos distinguem batalhas com o mesmo nome.
  const identity=[battle.id,battle.seed,battle.events.length,source.houseId,source.unitId].join('|');
  const entry:WarConvocationEntry={
   houseId:source.houseId,unitId:source.unitId,unitName:unit.name,side:unit.side,
   roll:row.die,condition:row.condition,disorganizations:row.disorganizations,
   sourceVersion:source.version??null,
   projectedTraining:row.proposedTraining,training:row.training,
   operationKey:stableWarUuid('convocation-key|'+identity),
   evolutionId:stableWarUuid('convocation-evolution|'+identity),
   justification:'Convocação: '+name+' · rodada '+battle.round+' · '+
    (battle.winner?(battle.winner===unit.side?'vitória':'derrota'):'sem vencedor')+
    ' · tropa '+CONDITION_LABEL[row.condition]+
    (row.disorganizations>1?' ('+row.disorganizations+' desorganizações)':'')+
    ' · d6 '+row.die+' (Tabela 10-6)',
  };
  byHouse.set(source.houseId,[...(byHouse.get(source.houseId)??[]),entry]);
 }
 return {battleId:battle.id,battleName:name,
  houses:[...byHouse.entries()].map(([houseId,entries])=>({houseId,entries})),
  modelUnits,officialUnits,glory:aftermath.glory};
}
