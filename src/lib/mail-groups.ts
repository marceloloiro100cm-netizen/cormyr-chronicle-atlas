/** Grupos oficiais de narração da segunda temporada, alinhados às regiões
 * da Central de missivas do Narrador (Grupo 1 · Dragon Coast, Grupo 2 ·
 * Horselands). Harcourt pertence a Horselands (decisão do proprietário,
 * 19/11/2026). Casas desconhecidas ficam sem grupo até o Narrador confirmar. */
export const NARRATION_GROUPS=[
 {id:'1',label:'Grupo 1 · Costa do Dragão',houseIds:['ashkar','fewmerry','goldfin','grantass']},
 {id:'2',label:'Grupo 2 · Horselands',houseIds:['erdenor','everlost','harcourt','silversky']},
] as const;
export function narrationHouseIds(group:string,available:string[]):string[]{
 const ids=NARRATION_GROUPS.find(g=>g.id===group)?.houseIds??[];
 return available.filter(id=>ids.some(x=>x===id.toLowerCase()));
}
