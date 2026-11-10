export const PALETTE_ROLES=['plain','forest','hill','rock','water','settlement','attacker','defender','selection','move','attack','metal','gold','skin','wood','goblin','cloth','ink','paper','ground'] as const;
export type MiniaturePalette=Record<typeof PALETTE_ROLES[number],string>;
/** Read theme only after mount; no browser globals at import or render. */
export function readMiniaturePalette(element:HTMLElement):MiniaturePalette{
 const style=getComputedStyle(element);
 return Object.fromEntries(PALETTE_ROLES.map(role=>[role,style.getPropertyValue('--mini-'+role).trim()])) as MiniaturePalette;
}