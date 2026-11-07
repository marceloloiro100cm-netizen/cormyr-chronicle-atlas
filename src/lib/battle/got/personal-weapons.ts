import type {WarHero} from './heroes';

/** Amostra verificável da tabela 9-3; não é o catálogo completo do livro. */
export type WarPersonalWeaponId='longsword'|'greatsword'|'spear'|'pike'|
 'hunting-bow'|'longbow'|'light-crossbow';
export type WarPersonalWeapon=Readonly<{
 id:WarPersonalWeaponId;label:string;
 family:'melee'|'ranged';damageAbility:'athletics'|'agility';
 damageBonus:number;reachMetres:number;range:'none'|'short'|'long';
 piercing:number;cruel:boolean;
}>;
export const WAR_PERSONAL_WEAPONS:Readonly<Record<WarPersonalWeaponId,WarPersonalWeapon>>={
 longsword:{id:'longsword',label:'Espada longa',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false},
 greatsword:{id:'greatsword',label:'Montante',family:'melee',
  damageAbility:'athletics',damageBonus:3,reachMetres:1,range:'none',
  piercing:0,cruel:true},
 spear:{id:'spear',label:'Lança',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false},
 pike:{id:'pike',label:'Pique',family:'melee',
  damageAbility:'athletics',damageBonus:2,reachMetres:1,range:'none',
  piercing:0,cruel:false},
 'hunting-bow':{id:'hunting-bow',label:'Arco de caça',family:'ranged',
  damageAbility:'agility',damageBonus:0,reachMetres:0,range:'long',
  piercing:0,cruel:false},
 longbow:{id:'longbow',label:'Arco longo',family:'ranged',
  damageAbility:'agility',damageBonus:2,reachMetres:0,range:'long',
  piercing:1,cruel:false},
 'light-crossbow':{id:'light-crossbow',label:'Besta leve',family:'ranged',
  damageAbility:'agility',damageBonus:1,reachMetres:0,range:'long',
  piercing:0,cruel:false},
};
export function equipModelWarHero(hero:WarHero,input:{
 melee:WarPersonalWeaponId;ranged:WarPersonalWeaponId;
}):WarHero{
 const melee=WAR_PERSONAL_WEAPONS[input.melee],ranged=WAR_PERSONAL_WEAPONS[input.ranged];
 if(melee.family!=='melee'||ranged.family!=='ranged')
  throw new Error('Escolha uma arma de Luta e uma de Pontaria.');
 const base=(w:WarPersonalWeapon):number=>
  w.damageAbility==='athletics'?hero.athletics??3:hero.agility??3;
 return {...hero,meleeWeapon:melee,rangedWeapon:ranged,
  meleeDamage:Math.max(1,base(melee)+melee.damageBonus),
  rangedDamage:Math.max(1,base(ranged)+ranged.damageBonus),
  rangedRange:ranged.range};
}
/** Perfurante reduz o VA, sem produzir VA negativo. */
export function effectivePersonalArmor(armor:number,weapon:WarPersonalWeapon|undefined):number{
 return Math.max(0,armor-(weapon?.piercing??0));
}
