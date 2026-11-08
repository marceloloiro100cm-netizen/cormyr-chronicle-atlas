import {crzSealCreature,type CrzCreature} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';

/** Um de/para EXPLÍCITO, para o laboratório D&D.
 * Nenhum destes números aparece no livro de Guerra dos Tronos nem é extraído
 * de ficha oficial de Casa. São perfis originais e editáveis de 5e simplificada.
 * A tabela inclui todos os 17 tipos oficiais; naval não é fingido terrestre.
 */
export type DndUnitConversion=Readonly<{
 typeId:string;name:string;individualsPerOriginalUnit:number;
 hp:number;ac:number;initiativeModifier:number;speedFt:number;
 meleeToHit:number;meleeDice:string;meleeDamageBonus:number;
 rangedToHit?:number;rangedDice?:string;rangedDamageBonus?:number;
 rangedRangeFt?:number;requiresNarratorReview?:boolean;
 unavailableReason?:string;
}>;
export const DND_MILITARY_MAPPING:readonly DndUnitConversion[]=[
 {typeId:'support',name:'Apoio',individualsPerOriginalUnit:100,hp:8,ac:11,initiativeModifier:0,speedFt:30,meleeToHit:2,meleeDice:'1d4',meleeDamageBonus:0},
 {typeId:'archers',name:'Arqueiros',individualsPerOriginalUnit:100,hp:9,ac:13,initiativeModifier:2,speedFt:30,meleeToHit:3,meleeDice:'1d4',meleeDamageBonus:1,rangedToHit:4,rangedDice:'1d8',rangedDamageBonus:2,rangedRangeFt:150},
 {typeId:'scouts',name:'Batedores',individualsPerOriginalUnit:100,hp:9,ac:13,initiativeModifier:3,speedFt:35,meleeToHit:3,meleeDice:'1d6',meleeDamageBonus:1,rangedToHit:4,rangedDice:'1d6',rangedDamageBonus:1,rangedRangeFt:80},
 {typeId:'cavalry',name:'Cavalaria',individualsPerOriginalUnit:20,hp:18,ac:16,initiativeModifier:1,speedFt:60,meleeToHit:5,meleeDice:'1d10',meleeDamageBonus:3},
 {typeId:'criminals',name:'Criminosos',individualsPerOriginalUnit:100,hp:8,ac:12,initiativeModifier:2,speedFt:30,meleeToHit:3,meleeDice:'1d6',meleeDamageBonus:1},
 {typeId:'crusaders',name:'Cruzados',individualsPerOriginalUnit:100,hp:13,ac:16,initiativeModifier:1,speedFt:30,meleeToHit:4,meleeDice:'1d8',meleeDamageBonus:2},
 {typeId:'engineers',name:'Engenheiros',individualsPerOriginalUnit:100,hp:10,ac:13,initiativeModifier:1,speedFt:30,meleeToHit:3,meleeDice:'1d6',meleeDamageBonus:1},
 {typeId:'special',name:'Especial',individualsPerOriginalUnit:100,hp:12,ac:14,initiativeModifier:2,speedFt:30,meleeToHit:4,meleeDice:'1d8',meleeDamageBonus:2,requiresNarratorReview:true},
 {typeId:'personal-guard',name:'Guarda pessoal',individualsPerOriginalUnit:100,hp:16,ac:18,initiativeModifier:2,speedFt:30,meleeToHit:6,meleeDice:'1d8',meleeDamageBonus:3},
 {typeId:'garrison',name:'Guarnição',individualsPerOriginalUnit:100,hp:11,ac:16,initiativeModifier:1,speedFt:30,meleeToHit:4,meleeDice:'1d8',meleeDamageBonus:2},
 {typeId:'guerrillas',name:'Guerrilheiros',individualsPerOriginalUnit:100,hp:9,ac:13,initiativeModifier:3,speedFt:35,meleeToHit:3,meleeDice:'1d6',meleeDamageBonus:1,rangedToHit:4,rangedDice:'1d6',rangedDamageBonus:1,rangedRangeFt:60},
 {typeId:'infantry',name:'Infantaria',individualsPerOriginalUnit:100,hp:12,ac:15,initiativeModifier:1,speedFt:30,meleeToHit:4,meleeDice:'1d8',meleeDamageBonus:2},
 {typeId:'sailors',name:'Marinheiros',individualsPerOriginalUnit:100,hp:10,ac:12,initiativeModifier:2,speedFt:30,meleeToHit:3,meleeDice:'1d6',meleeDamageBonus:1},
 {typeId:'mercenaries',name:'Mercenários',individualsPerOriginalUnit:100,hp:13,ac:15,initiativeModifier:2,speedFt:30,meleeToHit:5,meleeDice:'1d8',meleeDamageBonus:3},
 {typeId:'warships',name:'Navios de guerra',individualsPerOriginalUnit:5,hp:0,ac:0,initiativeModifier:0,speedFt:0,meleeToHit:0,meleeDice:'1d4',meleeDamageBonus:0,unavailableReason:'Navios exigem mapa naval e escala de embarcações; não converter em soldados terrestres.'},
 {typeId:'levies',name:'Plebeus recrutados',individualsPerOriginalUnit:100,hp:7,ac:10,initiativeModifier:0,speedFt:30,meleeToHit:2,meleeDice:'1d4',meleeDamageBonus:0},
 {typeId:'raiders',name:'Saqueadores',individualsPerOriginalUnit:100,hp:10,ac:13,initiativeModifier:2,speedFt:35,meleeToHit:4,meleeDice:'1d8',meleeDamageBonus:2},
] as const;
const average=(dice:string,mod:number)=>{
 const match=/^(\d+)d(\d+)$/.exec(dice);
 if(!match)throw new Error('Dados inválidos no de/para D&D.');
 return Math.max(0,Math.floor(Number(match[1])*(Number(match[2])+1)/2+mod));
};
export const dndMilitaryTemplateId=(typeId:string)=>'dnd-'+typeId+'|original';
export const dndMilitaryType=(templateId:string):string|undefined=>
 DND_MILITARY_MAPPING.find(x=>dndMilitaryTemplateId(x.typeId)===templateId)?.typeId;
const officialProfile=(entry:DndUnitConversion):CrzCreature=>{
 if(entry.unavailableReason)throw new Error(entry.unavailableReason);
 const attacks:CrzCreature['attacks']=[
  {id:'melee',name:'Ataque corpo a corpo',kind:'melee',toHit:entry.meleeToHit,
   reachFt:5,damage:[{dice:entry.meleeDice,mod:entry.meleeDamageBonus,
    avg:average(entry.meleeDice,entry.meleeDamageBonus),type:'slashing'}]},
  ...(entry.rangedDice&&entry.rangedToHit!==undefined?[
   {id:'ranged',name:'Ataque à distância',kind:'ranged' as const,
    toHit:entry.rangedToHit,rangeFt:{normal:entry.rangedRangeFt??80,
     long:(entry.rangedRangeFt??80)*4},
    damage:[{dice:entry.rangedDice,mod:entry.rangedDamageBonus??0,
     avg:average(entry.rangedDice,entry.rangedDamageBonus??0),
     type:'piercing' as const}]},
  ]:[]),
 ];
 return crzSealCreature({
  schemaVersion:1,id:dndMilitaryTemplateId(entry.typeId),
  name:entry.name,source:'De/para D&D original do Cormyr',
  size:'M',creatureType:'humanoid',tags:['cormyr','military','dnd',entry.typeId],
  cr:0.25,xp:50,proficiencyBonus:2,
  abilityMods:{str:2,dex:entry.initiativeModifier,con:1,int:0,wis:0,cha:0},
  hp:{average:entry.hp},ac:entry.ac,speedFt:{walk:entry.speedFt},
  attacks,multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},conditionImmunities:[],
  traits:[],flags:{flying:false,ranged:attacks.length>1,caster:false,
   legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Perfis de combate simplificados e originais do Cormyr Chronicle Atlas.',
   permissionEvidence:'De/para criado para o próprio simulador Cormyr, sem reproduzir estatísticas de bestiários.'},
  warnings:[...(entry.requiresNarratorReview?[
   'Perfil especial genérico; o Narrador deve escolher a especialidade antes de confirmar o personagem.'
  ]:[]),'Conversão D&D digital, não uma transcrição de regras ou valores de Guerra dos Tronos.'],
 });
};
export const DND_MILITARY_CREATURES:readonly CrzCreature[]=
 DND_MILITARY_MAPPING.filter(x=>!x.unavailableReason).map(officialProfile);
export const DND_MILITARY_CATALOG=crzBuildCatalog(DND_MILITARY_CREATURES);
export const DND_MILITARY_CONVERSION_VERSION='CCA-DND-17-1' as const;
