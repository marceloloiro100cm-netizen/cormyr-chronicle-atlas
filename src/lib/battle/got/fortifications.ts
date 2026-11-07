import type {WarPosition,WarSide,WarUnit} from './types';

/** Capítulo 10 pp. 227–228: bônus de Defesa e capacidade dos fortes.
 * Só altera snapshots da simulação; nenhuma posse da Casa é modificada.
 */
export const WAR_FORT_PROFILES={
 tower:{label:'Torre',defense:3,capacity:1},
 hall:{label:'Salão',defense:4,capacity:2},
 'small-castle':{label:'Castelo pequeno',defense:6,capacity:3},
 castle:{label:'Castelo',defense:8,capacity:5},
 'superior-castle':{label:'Castelo superior',defense:12,capacity:10},
 'temporary':{label:'Fortificação temporária',defense:1,capacity:1},
} as const;
export type WarFortKind=keyof typeof WAR_FORT_PROFILES;
export type WarFortification=Readonly<{
 id:string;name:string;side:WarSide;kind:WarFortKind;
 cells:readonly WarPosition[];engineerBuilt:boolean;hoursBuilt:number;
 sabotage:number;
 /** Parâmetros destrutíveis do laboratório digital, não valores oficiais de PV do livro. */
 structuralHealth?:number;structuralArmor?:number;breached?:boolean;
 /** Dificuldade de quebrar a estrutura, adjudicada pelo Narrador. */
 structuralDifficulty?:number;
}>;
const same=(a:WarPosition,b:WarPosition)=>a.x===b.x&&a.y===b.y;
export function makeWarFortification(input:Omit<WarFortification,'sabotage'>):WarFortification{
 const profile=WAR_FORT_PROFILES[input.kind];
 if(!profile||!input.id.trim()||!input.cells.length)throw new Error('Fortificação inválida.');
 if(new Set(input.cells.map(x=>x.x+':'+x.y)).size!==input.cells.length)
  throw new Error('Quadrados de fortificação repetidos.');
 if(input.cells.length>profile.capacity)
  throw new Error('A fortificação excede sua capacidade de unidades.');
 if(input.kind==='temporary'&&input.hoursBuilt<6)
  throw new Error('Fortificação temporária exige seis horas de preparação.');
 return {...input,cells:input.cells.map(c=>({...c})),sabotage:0};
}
export function fortDefense(fort:WarFortification):number{
 if(fort.breached||fort.structuralHealth===0)return 0;
 const base=WAR_FORT_PROFILES[fort.kind].defense+
  (fort.kind==='temporary'&&fort.engineerBuilt?1:0);
 return Math.max(0,base-fort.sabotage);
}
export function fortForUnit(forts:readonly WarFortification[],unit:WarUnit):WarFortification|null{
 return forts.filter(f=>!f.breached&&f.structuralHealth!==0&&f.side===unit.side&&f.cells.some(c=>same(c,unit.position)))
  .sort((a,b)=>fortDefense(b)-fortDefense(a))[0]??null;
}
export function validateWarForts(
 forts:readonly WarFortification[],units:readonly WarUnit[],
 width:number,height:number,
):void{
 const ids=new Set<string>();
 for(const fort of forts){
  if(ids.has(fort.id))throw new Error('Identificador de fortificação repetido.');
  ids.add(fort.id);
  if(!fort.cells.length||fort.cells.length>WAR_FORT_PROFILES[fort.kind].capacity||
   !Number.isInteger(fort.sabotage)||fort.sabotage<0||
   (fort.structuralHealth!==undefined&&(!Number.isInteger(fort.structuralHealth)||fort.structuralHealth<0))||
   (fort.structuralArmor!==undefined&&(!Number.isInteger(fort.structuralArmor)||fort.structuralArmor<0))||
   (fort.structuralDifficulty!==undefined&&(!Number.isInteger(fort.structuralDifficulty)||fort.structuralDifficulty<1)))
   throw new Error('Fortificação inconsistente.');
  if(fort.cells.some(c=>!Number.isInteger(c.x)||!Number.isInteger(c.y)||
   c.x<0||c.y<0||c.x>=width||c.y>=height))
   throw new Error('Fortificação fora do mapa.');
  const occupants=units.filter(u=>u.side===fort.side&&fort.cells.some(c=>same(c,u.position))&&
   !['destroyed','escaped','surrendered'].includes(u.condition));
  if(occupants.length>WAR_FORT_PROFILES[fort.kind].capacity)
   throw new Error('A ocupação excede a capacidade da fortificação.');
 }
}
export function sabotageFortification(
 fort:WarFortification,degrees:number,
):WarFortification{
 if(!Number.isInteger(degrees)||degrees<1||degrees>4)
  throw new Error('A sabotagem precisa de um grau de sucesso válido.');
 return {...fort,sabotage:fort.sabotage+degrees};
}

/** Valores de integridade são uma convenção configurável do jogo digital.
 * O livro fornece bônus de Defesa e Athletics para destruir objetos,
 * mas não uma tabela de Saúde específica para cada fortificação.
 */
export const WAR_FORT_DIGITAL_DURABILITY:Readonly<Record<WarFortKind,{health:number;armor:number}>>={
 tower:{health:20,armor:5},
 hall:{health:25,armor:5},
 'small-castle':{health:35,armor:8},
 castle:{health:50,armor:8},
 'superior-castle':{health:70,armor:10},
 temporary:{health:10,armor:2},
};
export function damageWarFortification(
 fort:WarFortification,rawDamage:number,
):Readonly<{fort:WarFortification;damage:number;breached:boolean}>{
 if(!Number.isFinite(rawDamage)||rawDamage<0)throw new Error('Dano estrutural inválido.');
 if(fort.breached||fort.structuralHealth===0)
  return {fort,damage:0,breached:true};
 const profile=WAR_FORT_DIGITAL_DURABILITY[fort.kind];
 const armor=fort.structuralArmor??profile.armor;
 const previous=fort.structuralHealth??profile.health;
 const damage=Math.min(previous,Math.max(0,Math.trunc(rawDamage)-armor));
 const health=previous-damage,breached=health===0;
 return {fort:{...fort,structuralHealth:health,structuralArmor:armor,breached},
  damage,breached};
}
