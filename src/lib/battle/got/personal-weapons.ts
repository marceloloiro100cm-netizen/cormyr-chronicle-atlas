import type {WarHero} from './heroes';

/** Amostra verificável da tabela 9-3; não é o catálogo completo do livro. */
export type WarPersonalWeaponId='longsword'|'bastard-sword'|'greatsword'|'long-axe'|'spear'|'pike'|'sledgehammer'|'peasant-tool'|'spiked-flail'|
 'fist'|'dagger'|'whip'|'boar-spear'|'net'|
 'staff'|'warhammer'|'buckler'|'left-hand-dagger'|'arakh'|'war-lance'|'tourney-lance'|
 'chain-ball'|'mace'|'flail'|'club'|'halberd'|'knife'|'gauntlet'|
 'shield'|'large-shield'|'body-shield'|'shortsword'|'stiletto'|'dirk'|
 'battle-axe'|'pickaxe'|'double-curved-bow'|'sling'|'throwing-javelin'|
 'trident'|'frog-spear'|'crowbill'|
 'hunting-bow'|'longbow'|'light-crossbow'|'medium-crossbow'|'myrish-crossbow'|'heavy-crossbow';
export type WarPersonalWeapon=Readonly<{
 id:WarPersonalWeaponId;label:string;
 family:'melee'|'ranged';damageAbility:'athletics'|'agility'|'animalHandling';
 damageBonus:number;reachMetres:number;range:'none'|'short'|'long';
 piercing:number;cruel:boolean;
 trainingBonusDice?:number;reload?:'minor'|'major';clumsy?:boolean;
 slow?:boolean;twoHanded?:boolean;mountedOnly?:boolean;
 adaptable?:boolean;powerful?:boolean;counterChargeOnly?:boolean;
 stunning?:boolean;shattering?:number;fragile?:boolean;
 grapple?:boolean;entangle?:boolean;impale?:boolean;fast?:boolean;
 shortBlade?:boolean;noDamage?:boolean;
 offhandDamageBonus?:number;defensiveOffhandBonus?:number;bulk?:number;
}>;
export const WAR_PERSONAL_WEAPONS:Readonly<Record<WarPersonalWeaponId,WarPersonalWeapon>>={
 longsword:{id:'longsword',label:'Espada longa',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false},
 'bastard-sword':{id:'bastard-sword',label:'Espada bastarda',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,adaptable:true},
 greatsword:{id:'greatsword',label:'Montante',family:'melee',
  damageAbility:'athletics',damageBonus:3,reachMetres:1,range:'none',
  piercing:0,cruel:true,clumsy:true,slow:true,twoHanded:true,powerful:true},
 'long-axe':{id:'long-axe',label:'Machado longo',family:'melee',
  damageAbility:'athletics',damageBonus:3,reachMetres:3,range:'none',
  piercing:0,cruel:true,trainingBonusDice:1,twoHanded:true,powerful:true},
 spear:{id:'spear',label:'Lança',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,fast:true},
 pike:{id:'pike',label:'Pique',family:'melee',
  damageAbility:'athletics',damageBonus:2,reachMetres:1,range:'none',
  piercing:0,cruel:false,slow:true,twoHanded:true,counterChargeOnly:true,impale:true},
 sledgehammer:{id:'sledgehammer',label:'Marreta',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false,twoHanded:true,slow:true,stunning:true,shattering:1},
 'peasant-tool':{id:'peasant-tool',label:'Ferramenta de aldeão',family:'melee',
  damageAbility:'athletics',damageBonus:2,reachMetres:1,range:'none',
  piercing:0,cruel:false,twoHanded:true,clumsy:true,fragile:true},
 'spiked-flail':{id:'spiked-flail',label:'Mangual com cravos',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:true,shattering:1},
 fist:{id:'fist',label:'Punho',family:'melee',
  damageAbility:'athletics',damageBonus:-3,reachMetres:1,range:'none',
  piercing:0,cruel:false,grapple:true,fast:true},
 dagger:{id:'dagger',label:'Adaga',family:'melee',
  damageAbility:'agility',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,fast:true,shortBlade:true,
  offhandDamageBonus:1,defensiveOffhandBonus:1},
 buckler:{id:'buckler',label:'Broquel',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,offhandDamageBonus:1,defensiveOffhandBonus:1},
 'left-hand-dagger':{id:'left-hand-dagger',label:'Adaga de mão esquerda',family:'melee',
  damageAbility:'agility',damageBonus:-1,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,
  offhandDamageBonus:1,defensiveOffhandBonus:2},
 arakh:{id:'arakh',label:'Arakh',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,adaptable:true,fast:true},
 staff:{id:'staff',label:'Cajado',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,fast:true,twoHanded:true},
 warhammer:{id:'warhammer',label:'Martelo de guerra',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,twoHanded:true,slow:true,shattering:2,powerful:true},
 'war-lance':{id:'war-lance',label:'Lança de guerra',family:'melee',
  damageAbility:'animalHandling',damageBonus:4,reachMetres:1,range:'none',
  piercing:0,cruel:true,trainingBonusDice:1,slow:true,
  mountedOnly:true,powerful:true,impale:true},
 'tourney-lance':{id:'tourney-lance',label:'Lança de torneio',family:'melee',
  damageAbility:'animalHandling',damageBonus:3,reachMetres:3,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,slow:true,
  mountedOnly:true,powerful:true,fragile:true},
 whip:{id:'whip',label:'Chicote',family:'melee',
  damageAbility:'agility',damageBonus:-1,reachMetres:3,range:'none',
  piercing:0,cruel:false,trainingBonusDice:2,entangle:true},
 'boar-spear':{id:'boar-spear',label:'Lança de javali',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,twoHanded:true,
  slow:true,powerful:true,impale:true},
 net:{id:'net',label:'Rede',family:'ranged',
  damageAbility:'agility',damageBonus:-15,reachMetres:0,range:'short',
  piercing:0,cruel:false,trainingBonusDice:1,entangle:true,noDamage:true},
 'chain-ball':{id:'chain-ball',label:'Bola com corrente',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,shattering:1,powerful:true},
 mace:{id:'mace',label:'Maça',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false},
 flail:{id:'flail',label:'Mangual',family:'melee',
  damageAbility:'athletics',damageBonus:3,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:2,twoHanded:true,
  shattering:1,powerful:true},
 club:{id:'club',label:'Porrete/Bordão',family:'melee',
  damageAbility:'athletics',damageBonus:-1,reachMetres:1,range:'none',
  piercing:0,cruel:false,offhandDamageBonus:1},
 halberd:{id:'halberd',label:'Alabarda',family:'melee',
  damageAbility:'athletics',damageBonus:3,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,twoHanded:true,powerful:true,bulk:1},
 knife:{id:'knife',label:'Faca',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,offhandDamageBonus:1,fast:true,shortBlade:true},
 gauntlet:{id:'gauntlet',label:'Manopla',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,grapple:true,offhandDamageBonus:1},
 shield:{id:'shield',label:'Escudo',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,defensiveOffhandBonus:2},
 'large-shield':{id:'large-shield',label:'Escudo grande',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,defensiveOffhandBonus:4,bulk:1},
 'body-shield':{id:'body-shield',label:'Escudo de corpo',family:'melee',
  damageAbility:'athletics',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:2,defensiveOffhandBonus:6,bulk:2},
 shortsword:{id:'shortsword',label:'Espada pequena',family:'melee',
  damageAbility:'agility',damageBonus:-1,reachMetres:1,range:'none',
  piercing:0,cruel:false,fast:true},
 stiletto:{id:'stiletto',label:'Estilete',family:'melee',
  damageAbility:'agility',damageBonus:0,reachMetres:1,range:'none',
  piercing:2,cruel:false,trainingBonusDice:1,shortBlade:true},
 dirk:{id:'dirk',label:'Punhal',family:'melee',
  damageAbility:'agility',damageBonus:-2,reachMetres:1,range:'none',
  piercing:0,cruel:false,offhandDamageBonus:2,shortBlade:true},
 'battle-axe':{id:'battle-axe',label:'Machado de batalha',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,adaptable:true},
 pickaxe:{id:'pickaxe',label:'Picareta',family:'melee',
  damageAbility:'athletics',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false,twoHanded:true,slow:true,powerful:true},
 trident:{id:'trident',label:'Tridente',family:'melee',
  damageAbility:'athletics',damageBonus:0,reachMetres:1,range:'none',
  piercing:0,cruel:false,adaptable:true,slow:true},
 'frog-spear':{id:'frog-spear',label:'Lança de sapo',family:'melee',
  damageAbility:'agility',damageBonus:1,reachMetres:1,range:'none',
  piercing:0,cruel:false,trainingBonusDice:1,adaptable:true},
 crowbill:{id:'crowbill',label:'Bico de corvo',family:'melee',
  damageAbility:'athletics',damageBonus:-1,reachMetres:1,range:'none',
  piercing:0,cruel:false,shattering:1},
 'double-curved-bow':{id:'double-curved-bow',label:'Arco de curvatura dupla',
  family:'ranged',damageAbility:'agility',damageBonus:1,reachMetres:0,
  range:'long',piercing:0,cruel:false,trainingBonusDice:1,
  twoHanded:true,powerful:true},
 sling:{id:'sling',label:'Funda',family:'ranged',
  damageAbility:'athletics',damageBonus:-1,reachMetres:0,range:'long',
  piercing:0,cruel:false},
 'throwing-javelin':{id:'throwing-javelin',label:'Azagaia',family:'ranged',
  damageAbility:'athletics',damageBonus:0,reachMetres:0,range:'short',
  piercing:0,cruel:false},
 'hunting-bow':{id:'hunting-bow',label:'Arco de caça',family:'ranged',
  damageAbility:'agility',damageBonus:0,reachMetres:0,range:'long',
  piercing:0,cruel:false},
 longbow:{id:'longbow',label:'Arco longo',family:'ranged',
  damageAbility:'agility',damageBonus:2,reachMetres:0,range:'long',
  piercing:1,cruel:false,trainingBonusDice:1,clumsy:true,twoHanded:true},
 'light-crossbow':{id:'light-crossbow',label:'Besta leve',family:'ranged',
  damageAbility:'agility',damageBonus:1,reachMetres:0,range:'long',
  piercing:0,cruel:false,slow:true,reload:'minor'},
 'medium-crossbow':{id:'medium-crossbow',label:'Besta média',family:'ranged',
  damageAbility:'agility',damageBonus:1,reachMetres:0,range:'long',
  piercing:1,cruel:false,slow:true,twoHanded:true,reload:'minor'},
 'myrish-crossbow':{id:'myrish-crossbow',label:'Besta myrish',family:'ranged',
  damageAbility:'agility',damageBonus:1,reachMetres:0,range:'long',
  piercing:1,cruel:false,fast:true,twoHanded:true,trainingBonusDice:1,reload:'minor'},
 'heavy-crossbow':{id:'heavy-crossbow',label:'Besta pesada',family:'ranged',
  damageAbility:'agility',damageBonus:2,reachMetres:0,range:'long',
  piercing:2,cruel:true,slow:true,reload:'major',twoHanded:true},
};
/** Ataque com duas armas só aceita segunda arma que tenha Mão Inábil.
 * Usar a segunda arma no ataque suspende seu bônus Defensivo.
 */
export function equipModelWarOffhand(hero:WarHero,weaponId:WarPersonalWeaponId|null):WarHero{
 if(weaponId===null)return {...hero,offhandWeapon:undefined,offhandDefenseSuppressed:false,
  offhandDefenseDamage:0,offhandWeaponBroken:false};
 const weapon=WAR_PERSONAL_WEAPONS[weaponId];
 if((!weapon.offhandDamageBonus&&!weapon.defensiveOffhandBonus)||weapon.family!=='melee')
  throw new Error('Escolha arma de Mão Inábil ou escudo Defensivo para a mão secundária.');
 if(hero.meleeWeapon?.twoHanded)
  throw new Error('Arma principal de Duas Mãos não permite equipar arma secundária.');
 return {...hero,offhandWeapon:weapon,offhandDefenseSuppressed:false,
  offhandDefenseDamage:0,offhandWeaponBroken:false};
}
export function activePersonalOffhandDefense(hero:WarHero):number{
 return hero.offhandDefenseSuppressed||hero.offhandWeaponBroken?0:
  Math.max(0,(hero.offhandWeapon?.defensiveOffhandBonus??0)-
   (hero.offhandDefenseDamage??0));
}
export function equipModelWarHero(hero:WarHero,input:{
 melee:WarPersonalWeaponId;ranged:WarPersonalWeaponId;
}):WarHero{
 const melee=WAR_PERSONAL_WEAPONS[input.melee],ranged=WAR_PERSONAL_WEAPONS[input.ranged];
 if(melee.family!=='melee'||ranged.family!=='ranged')
  throw new Error('Escolha uma arma de Luta e uma de Pontaria.');
 if(melee.twoHanded&&hero.offhandWeapon)
  throw new Error('Arma principal de Duas Mãos não permite escudo ou arma secundária.');
 const base=(w:WarPersonalWeapon):number=>
  w.damageAbility==='athletics'?(hero.athletics??3):
  w.damageAbility==='animalHandling'?(hero.animalHandling??3):(hero.agility??3);
 return {...hero,meleeWeapon:melee,rangedWeapon:ranged,
  meleeDamage:Math.max(1,base(melee)+melee.damageBonus),
  rangedDamage:Math.max(1,base(ranged)+ranged.damageBonus),
  rangedRange:ranged.range,rangedLoaded:true};
}
/** Perfurante reduz o VA, sem produzir VA negativo. */
export function effectivePersonalArmor(armor:number,weapon:WarPersonalWeapon|undefined):number{
 return Math.max(0,armor-(weapon?.piercing??0));
}
