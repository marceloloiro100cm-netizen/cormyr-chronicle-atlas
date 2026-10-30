/** Official narration groups for season two. Unknown houses are deliberately
 * unassigned until the Narrator confirms their group. */
export const NARRATION_GROUPS=[
 {id:'1',label:'Grupo 1',houseIds:['erdenor','silversky','everlost','harcourt']},
 {id:'2',label:'Grupo 2',houseIds:['fewmerry','grantass']},
] as const;
export function narrationHouseIds(group:string,available:string[]):string[]{
 const ids=NARRATION_GROUPS.find(g=>g.id===group)?.houseIds??[];
 return available.filter(id=>ids.some(x=>x===id.toLowerCase()));
}
