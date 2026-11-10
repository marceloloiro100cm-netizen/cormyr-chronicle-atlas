import type {CreatureMiniatureKind,MiniatureKind} from './tokens';

/** Read-only artistic categorization. No stat blocks, monster art, source licenses,
 * original names or game effects are copied into the renderer.
 */
export type CreatureVisualIdentity=Readonly<{
 id:string;name:string;creatureType:string;tags:readonly string[];
}>;
export type CreatureVisualChoice=Readonly<{kind:MiniatureKind;fallback:boolean}>;

export const CREATURE_VISUAL_FAMILIES=[
 'goblin','kobold','orc','dragon','undead','skeleton','zombie','spirit',
 'construct','beast','giant','humanoid','elemental','fiend','celestial',
 'aberration','ooze','plant','fey','insect','spider','serpent',
 'troll','aquatic','swarm',
] as const satisfies readonly CreatureMiniatureKind[];

/** Diacritics and multilingual names are normalized to avoid altering
 * creature data. Recognition by creatureType takes precedence over generic
 * display-name guessing, except for specific, generic silhouettes.
 */
const normalize=(s:string)=>s.toLocaleLowerCase('en').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').trim();
const has=(s:string,terms:readonly string[])=>terms.some(x=>
 new RegExp('(?:^|\\W)'+x+'(?:$|\\W)','i').test(s));

const familyFromSpecific=(haystack:string):CreatureMiniatureKind|undefined=>{
 const specific:readonly (readonly [CreatureMiniatureKind,readonly string[]])[]=[
  ['goblin',['goblin','hobgoblin','bugbear']],
  ['kobold',['kobold']],
  ['orc',['orc','orcish','orque']],
  ['skeleton',['skeleton','esqueleto']],
  ['zombie',['zombie','zumbi']],
  ['spirit',['ghost','specter','spectre','wraith','fantasma','espectro']],
  ['spider',['spider','aranha']],
  ['insect',['insect','beetle','centipede','escorpiao','besouro','inseto']],
  ['serpent',['serpent','snake','cobra','serpente']],
  ['troll',['troll']],
  ['aquatic',['shark','tubarao','octopus','polvo','fish','peixe','kraken']],
  ['swarm',['swarm','enxame']],
 ];
 for(const [kind,terms] of specific)if(has(haystack,terms))return kind;
 return undefined;
};
const canonicalType=(type:string):CreatureMiniatureKind|undefined=>{
 switch(normalize(type)){
  case 'dragon':case 'dragao':return 'dragon';
  case 'undead':case 'morto vivo':return 'undead';
  case 'construct':case 'constructo':case 'construto':return 'construct';
  case 'beast':case 'fera':case 'monstrosity':case 'monstruosidade':return 'beast';
  case 'giant':case 'gigante':return 'giant';
  case 'humanoid':case 'humanoide':return 'humanoid';
  case 'elemental':return 'elemental';
  case 'fiend':case 'infernal':return 'fiend';
  case 'celestial':return 'celestial';
  case 'aberration':case 'aberracao':return 'aberration';
  case 'ooze':case 'limo':case 'gosma':return 'ooze';
  case 'plant':case 'planta':return 'plant';
  case 'fey':case 'fada':return 'fey';
  default:return undefined;
 }
};
/** The fallback is visibly generic when creatureType is unknown. */
export function classifyCreatureArtwork(template:CreatureVisualIdentity):CreatureVisualChoice{
 const tags=template.tags.map(normalize);
 const specific=familyFromSpecific(tags.join(' ')+' '+normalize(template.name));
 if(specific)return {kind:specific,fallback:false};
 const family=canonicalType(template.creatureType);
 if(family)return {kind:family,fallback:false};
 return {kind:'generic',fallback:true};
}
