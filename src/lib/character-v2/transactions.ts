import {CharacterV2Schema,type CharacterV2,type CharacterSkillId} from './schema';
import {SPECIALTY_REGISTRY,normalizeSpecialty} from './creation';
import {applyEconomyCommand,replayEconomyLedger,type EconomyLedger,type EconomyCommand} from './economy';

/**
 * Lotes 04/06: transação PURA de progressão, sem banco.
 * O servidor deverá usar esta mesma operação DENTRO de RPC com RLS,
 * bloqueio de versão, saldo e gravação atômica de ambos os documentos.
 */
type ProgressionCommand=EconomyCommand & {
  skillId:CharacterSkillId;specialtyId:string;
};
export type ProgressionResult=Readonly<{
 character:CharacterV2;ledger:EconomyLedger;availableXp:number;
}>;
function ensureAuthorizedPreview(character:CharacterV2,ledger:EconomyLedger){
 CharacterV2Schema.parse(character);
 if(character.id!==ledger.characterId)throw new Error('Livro-razão pertence a outro personagem.');
 if(character.migrationStatus!=='read_only_preview'||character.review.status!=='approved')
  throw new Error('Ficha ainda não homologada: compras só após migração segura e autorização.');
 // A integração do lote 11 ativará persistência. Estes métodos são avaliação pura.
}
export function quoteSpecialtyUpgrade(character:CharacterV2,skillId:CharacterSkillId,specialtyId:string){
 const id=normalizeSpecialty(specialtyId);
 if(!SPECIALTY_REGISTRY[skillId].some(entry=>entry.id===id))
  throw new Error('Especialidade ausente do catálogo aprovado da habilidade.');
 const current=character.specialties.find(s=>s.skillId===skillId&&
  normalizeSpecialty(s.specialtyId)===id);
 if(current&&!current.verified)throw new Error('Especialidade importada exige reconciliação.');
 const before=current?.bonusDice??0;
 const maximum=character.skillRanks[skillId];
 if(before>=maximum)throw new Error('Dados de bônus não podem exceder graduação.');
 return{target:skillId+':'+id,before,after:before+1,costXp:10};
}
export function simulateSpecialtyPurchase(
 characterInput:CharacterV2,ledger:EconomyLedger,input:ProgressionCommand,
):ProgressionResult{
 const character=CharacterV2Schema.parse(characterInput);
 ensureAuthorizedPreview(character,ledger);
 if(input.operation!=='purchase_specialty')throw new Error('Operação não é compra de especialidade.');
 const quote=quoteSpecialtyUpgrade(character,input.skillId,input.specialtyId);
 if(input.target!==quote.target)throw new Error('Alvo da compra não corresponde à especialidade.');
 if(input.amount!==1)throw new Error('Compre somente um dado de bônus por operação.');
 const tx=applyEconomyCommand(ledger,input);
 const index=character.specialties.findIndex(s=>s.skillId===input.skillId&&
  normalizeSpecialty(s.specialtyId)===normalizeSpecialty(input.specialtyId));
 const specialties=character.specialties.map(s=>({...s}));
 if(index<0){
  specialties.push({id:'specialty:'+input.id,skillId:input.skillId,
    specialtyId:normalizeSpecialty(input.specialtyId),bonusDice:1,verified:true});
 }else{
  const current=specialties[index];
  if(!current)throw new Error('Estado de especialidade inconsistente.');
  specialties[index]={...current,bonusDice:quote.after};
 }
 const after=CharacterV2Schema.parse({...character,specialties,version:character.version+1});
 return{character:after,ledger:tx.ledger,availableXp:tx.balances.xp};
}
/**
 * Estorno de especialidade exige verificar evento original + graduação atual.
 * Permite somente a última compra daquela especialidade, para evitar reverter
 * uma graduação intermediária sem conferir a evolução subsequente.
 */
export function simulateSpecialtyRefund(
 characterInput:CharacterV2,ledger:EconomyLedger,input:ProgressionCommand,
):ProgressionResult{
 const character=CharacterV2Schema.parse(characterInput);
 ensureAuthorizedPreview(character,ledger);
 if(input.operation!=='reverse_purchase'||!input.isNarrator||!input.narratorApproved)
  throw new Error('Estorno de ficha exige Narrador.');
 const target=input.skillId+':'+normalizeSpecialty(input.specialtyId);
 if(input.target!==target)throw new Error('Alvo de estorno inválido.');
 const purchase=ledger.events.find(e=>e.id===input.reversalOf);
 if(!purchase||purchase.operation!=='purchase_specialty'||purchase.target!==target)
  throw new Error('Compra original inexistente.');
 const last=ledger.events.filter(e=>e.operation==='purchase_specialty'&&e.target===target).at(-1);
 if(last?.id!==purchase.id)throw new Error('Estorno só pode atingir a última graduação adquirida.');
 const existing=character.specialties.find(s=>s.skillId===input.skillId&&
  normalizeSpecialty(s.specialtyId)===normalizeSpecialty(input.specialtyId));
 if(!existing||existing.bonusDice<=0||!existing.verified)
  throw new Error('Especialidade não validada para reembolso.');
 const tx=applyEconomyCommand(ledger,input);
 const specialties=character.specialties.map(s=>s.id===existing.id?
  {...s,bonusDice:s.bonusDice-1}:s).filter(s=>s.bonusDice>0);
 return{character:CharacterV2Schema.parse({...character,specialties,version:character.version+1}),
  ledger:tx.ledger,availableXp:replayEconomyLedger(tx.ledger).xp};
}
