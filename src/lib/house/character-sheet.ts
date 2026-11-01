import {parseDate} from '@/lib/calendar/harptos';
export const CHARACTER_SKILLS=['Agilidade','Atletismo','Briga','Conhecimento','Cura','Enganação','Furtividade','Guerra','Idioma','Ladinagem','Lidar com Animais','Luta','Percepção','Persuasão','Pontaria','Sobrevivência','Status','Vigor','Vontade'] as const;
export type CharacterSkill=typeof CHARACTER_SKILLS[number];
export type ChronicleSheet={
 version:1;name:string;role:string;skills:Record<CharacterSkill,number>;
 birthYear?:number|null;birthDate?:string;
 cunning:number;shield:number;armorPenalty:number;movement:number;
 specialties:string;destiny:number;spentDestiny:number;qualities:string;flaws:string;xpSpent:number;
};
const PREFIX='Ficha de Personagem · Chronicle System · Estruturada\n';
export function blankChronicleSheet():ChronicleSheet{
 return {version:1,name:'',role:'Lorde / Herdeiro',birthYear:null,birthDate:'',skills:Object.fromEntries(CHARACTER_SKILLS.map(s=>[s,2])) as Record<CharacterSkill,number>,
 cunning:2,shield:0,armorPenalty:0,movement:4,specialties:'',destiny:0,spentDestiny:0,qualities:'',flaws:'',xpSpent:0};
}
export function parseChronicleSheet(content:string):ChronicleSheet|null{
 if(!content.startsWith(PREFIX))return null;
 try {
  const raw=JSON.parse(content.slice(PREFIX.length)) as Partial<ChronicleSheet>;
  if(raw.version!==1||typeof raw.name!=='string'||!raw.skills)return null;
  const defaults=blankChronicleSheet();
  const skills=Object.fromEntries(CHARACTER_SKILLS.map(s=>[s,Number(raw.skills?.[s]??2)])) as ChronicleSheet['skills'];
  return {...defaults,...raw,skills};
 }catch{return null;}
}
export function serializeChronicleSheet(sheet:ChronicleSheet):string{
 if(!sheet.name.trim()||CHARACTER_SKILLS.some(k=>!Number.isInteger(sheet.skills[k])||sheet.skills[k]<1||sheet.skills[k]>10))
  throw new Error('Nome e 19 habilidades válidas são obrigatórios.');
 if(!Number.isInteger(sheet.cunning)||sheet.cunning<1||sheet.cunning>10)throw new Error('Astúcia deve estar entre 1 e 10.');
 if([sheet.shield,sheet.armorPenalty,sheet.movement,sheet.destiny,sheet.spentDestiny,sheet.xpSpent].some(n=>!Number.isInteger(n)||n<0))
  throw new Error('Custos e atributos adicionais devem ser inteiros não negativos.');
 if(sheet.spentDestiny>sheet.destiny)throw new Error('Pontos de Destino gastos excedem os totais.');
 if(sheet.birthYear!==undefined&&sheet.birthYear!==null&&(!Number.isInteger(sheet.birthYear)||sheet.birthYear<1||sheet.birthYear>9999))
  throw new Error('Ano de nascimento declarado inválido.');
 if(sheet.birthDate){
  const parsed=parseDate(sheet.birthDate);
  if(!parsed||sheet.birthYear===undefined||sheet.birthYear===null||parsed.year!==sheet.birthYear)
   throw new Error('Data de nascimento e ano declarado incompatíveis.');
 }
 return PREFIX+JSON.stringify(sheet);
}
export function chronicleStats(sheet:ChronicleSheet){
 const skills=sheet.skills;
 return {
  intrigueDefense:skills['Percepção']+sheet.cunning+skills['Status'],
  composure:skills['Vontade']*3,
  combatDefense:skills['Agilidade']+skills['Atletismo']+skills['Percepção']+sheet.shield-sheet.armorPenalty,
  health:skills['Vigor']*3,
  movement:sheet.movement,
 };
}
