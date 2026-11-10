/** Public, original *visual* taxonomy; contains no private 5e monster records or statistics. */
export const ADVANCED_MONSTER_KINDS=[
 'hobgoblin','bugbear','orc','ogre','troll','kobold',
 'dragon-young','dragon-elder','dracolich',
 'skeleton','zombie','wraith','lich','vampire',
 'stone-golem','iron-golem','animated-armor',
 'wolf','bear','spider','elemental','fiend','celestial',
] as const;
export type AdvancedMonsterKind=(typeof ADVANCED_MONSTER_KINDS)[number];
export const BASE_MONSTER_KINDS=[
 'goblin','dragon','undead','construct','beast','giant','humanoid',
] as const;
export type MonsterMiniatureKind=AdvancedMonsterKind|(typeof BASE_MONSTER_KINDS)[number];
export const MONSTER_MINIATURE_KINDS=[
 ...BASE_MONSTER_KINDS,...ADVANCED_MONSTER_KINDS,
] as const;
export function isAdvancedMonsterKind(kind:string):kind is AdvancedMonsterKind{
 return (ADVANCED_MONSTER_KINDS as readonly string[]).includes(kind);
}

/** Material tint only; never affects damage, anatomy, resistances, attacks or saves. */
export type DragonMiniatureTint='red'|'blue'|'green'|'black'|'white'|'gold'|'silver'|'bronze'|'copper'|'brass';
export const DRAGON_TINT_COLORS:Readonly<Record<DragonMiniatureTint,string>>={
 red:'#9f3935',blue:'#376baf',green:'#398552',black:'#323942',
 white:'#dfe3e2',gold:'#c7a04e',silver:'#9baab8',
 bronze:'#a3754e',copper:'#b66d4b',brass:'#c6a45a',
};
export function dragonTintFromName(text:string):DragonMiniatureTint|undefined{
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const entries:readonly [DragonMiniatureTint,RegExp][]=[
  ['red',/\b(red|vermelh[oa])\b/],['blue',/\b(blue|azul|azuis)\b/],
  ['green',/\b(green|verde[s]?)\b/],['black',/\b(black|pret[oa]|negr[oa])\b/],
  ['white',/\b(white|branc[oa])\b/],['gold',/\b(gold|dourad[oa])\b/],
  ['silver',/\b(silver|pratead[oa])\b/],['bronze',/\b(bronze)\b/],
  ['copper',/\b(copper|cobre)\b/],['brass',/\b(brass|latao)\b/],
 ];
 return entries.find(([,pattern])=>pattern.test(normalized))?.[0];
}
