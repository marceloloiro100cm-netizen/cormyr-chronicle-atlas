/**
 * Suggests the first day of the next désdia (Harptos: days 1, 11 and 21).
 * Pure suggestion for the HUB form; the Narrator can still choose another
 * date (including a festival) and the server validates every rule.
 */
export type HarptosDay={year:number;month:number;day:number;festival:string|null};
export function nextTendayStart(d:HarptosDay):HarptosDay{
  if(!d.festival&&d.day<=10)return {year:d.year,month:d.month,day:11,festival:null};
  if(!d.festival&&d.day<=20)return {year:d.year,month:d.month,day:21,festival:null};
  return d.month>=11?{year:d.year+1,month:0,day:1,festival:null}
    :{year:d.year,month:d.month+1,day:1,festival:null};
}
export function crossesMonth(from:HarptosDay,to:HarptosDay):boolean{
  return (to.year-from.year)*12+(to.month-from.month)>0;
}
