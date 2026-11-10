/** Estimativa transparente para comparar forças do montador.
 * Não substitui o nível de desafio, a iniciativa nem o motor de combate.
 */
export type EncounterSide='attacker'|'defender';
export type EncounterDraft=Readonly<{side:EncounterSide;templateId:string;count:number}>;
/** ND é opcional para perfis militares fictícios e monstros incompletos. */
export type EncounterCreature=Readonly<{
 id:string;hp?:number|undefined;ac?:number|undefined;cr?:number|undefined;
}>;
/** XP base por ND do bestiário 5e, sem multiplicador de encontros ou nível de grupo. */
export const DND_CR_XP:Readonly<Record<string,number>>={
 '0':10,'0.125':25,'0.25':50,'0.5':100,
 '1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,
 '7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,
 '13':10000,'14':11500,'15':13000,'16':15000,'17':18000,
 '18':20000,'19':22000,'20':25000,'21':33000,'22':41000,
 '23':50000,'24':62000,'25':75000,'26':90000,'27':105000,
 '28':120000,'29':135000,'30':155000,
};
export type EncounterSideSummary=Readonly<{
 stacks:number;creatures:number;totalHp:number|null;meanAc:number|null;unknown:number;
 xpTotal:number|null;unknownCr:number;
}>;
export type EncounterSummary=Readonly<{
 attacker:EncounterSideSummary;defender:EncounterSideSummary;comparison:string;
}>;
export function summarizeDndEncounter(
 drafts:readonly EncounterDraft[],creatures:readonly EncounterCreature[]):EncounterSummary{
 const byId=new Map(creatures.map(c=>[c.id,c]));
 const summarize=(side:EncounterSide):EncounterSideSummary=>{
  const rows=drafts.filter(d=>d.side===side);
  let n=0,hp=0,armor=0,unknown=0,xp=0,unknownCr=0;
  for(const row of rows){
   const count=Number.isSafeInteger(row.count)&&row.count>0?row.count:0;
   n+=count;
   const source=byId.get(row.templateId);
   const cr=source?.cr;
   const xpValue=cr!==undefined&&Number.isFinite(cr)?DND_CR_XP[String(cr)]:undefined;
   if(xpValue===undefined)unknownCr+=count;
   else xp+=count*xpValue;
   if(!source||typeof source.hp!=='number'||typeof source.ac!=='number'||
    !Number.isFinite(source.hp)||!Number.isFinite(source.ac)||
    source.hp<=0||source.ac<=0){
    unknown+=count;continue;
   }
   hp+=(source.hp??0)*count;armor+=(source.ac??0)*count;
  }
  return {stacks:rows.length,creatures:n,totalHp:unknown?null:hp,
   meanAc:unknown||!n?null:Math.round(armor/n*10)/10,unknown,
   xpTotal:unknownCr||!n?null:xp,unknownCr};
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
