/** Estimativa transparente para comparar forças do montador.
 * Não substitui o nível de desafio, a iniciativa nem o motor de combate.
 */
export type EncounterSide='attacker'|'defender';
export type EncounterDraft=Readonly<{side:EncounterSide;templateId:string;count:number}>;
export type EncounterCreature=Readonly<{id:string;hp?:number|undefined;ac?:number|undefined}>;
export type EncounterSideSummary=Readonly<{
 stacks:number;creatures:number;totalHp:number|null;meanAc:number|null;unknown:number;
}>;
export type EncounterSummary=Readonly<{
 attacker:EncounterSideSummary;defender:EncounterSideSummary;comparison:string;
}>;
export function summarizeDndEncounter(
 drafts:readonly EncounterDraft[],creatures:readonly EncounterCreature[]):EncounterSummary{
 const byId=new Map(creatures.map(c=>[c.id,c]));
 const summarize=(side:EncounterSide):EncounterSideSummary=>{
  const rows=drafts.filter(d=>d.side===side);
  let n=0,hp=0,armor=0,unknown=0;
  for(const row of rows){
   const count=Number.isSafeInteger(row.count)&&row.count>0?row.count:0;
   n+=count;
   const source=byId.get(row.templateId);
   if(!source||!Number.isFinite(source.hp)||!Number.isFinite(source.ac)||
    (source.hp??0)<=0||(source.ac??0)<=0){
    unknown+=count;continue;
   }
   hp+=(source.hp??0)*count;armor+=(source.ac??0)*count;
  }
  return {stacks:rows.length,creatures:n,totalHp:unknown?null:hp,
   meanAc:unknown||!n?null:Math.round(armor/n*10)/10,unknown};
 };
 const attacker=summarize('attacker'),defender=summarize('defender');
 let comparison='A força real depende também de ataques, iniciativa, terreno e ações.';
 if(attacker.totalHp!==null&&defender.totalHp!==null&&
   attacker.totalHp>0&&defender.totalHp>0){
  const stronger=attacker.totalHp>=defender.totalHp?'Atacantes':'Defensores';
  const ratio=Math.max(attacker.totalHp,defender.totalHp)/
   Math.min(attacker.totalHp,defender.totalHp);
  comparison=ratio<=1.25?'PV totais próximos; isso não garante equilíbrio.':
   stronger+' têm '+ratio.toLocaleString('pt-BR',{maximumFractionDigits:1})+
   '× os PV do outro lado; isso não prevê o vencedor.';
 }
 return {attacker,defender,comparison};
}
