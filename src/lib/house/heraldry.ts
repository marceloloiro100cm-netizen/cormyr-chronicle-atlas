/** Public visual identities only. Never use this list to decide permissions or ownership. */
export const HERALDIC_HOUSES = [
  'goldfin','ashkar','fewmerry','grantass','harcourt','everlost','silversky','erdenor',
] as const;
export type HeraldicHouse = typeof HERALDIC_HOUSES[number];

/** Exact match avoids assigning a player's theme to similarly named NPC houses. */
export function heraldicHouseKey(name:string):HeraldicHouse|null {
  const normalized=name.trim().toLocaleLowerCase('pt-BR').replace(/^casa\s+/,'').trim();
  return HERALDIC_HOUSES.find(key=>key===normalized)??null;
}
export function heraldicCrestUrl(theme:HeraldicHouse|null):string|null {
  return theme?`/house-flags/player-${theme}.webp`:null;
}
