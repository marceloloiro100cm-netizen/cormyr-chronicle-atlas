/**
 * Preserve the original season-two mail_page filter keys and narrator groups.
 * These filters only RESTRICT data. The Firestore server independently
 * rechecks live Firebase Auth and House membership on every request.
 */
import {narrationHouseIds} from '@/lib/mail-groups';

export type OriginalMailFilters={
  box:string;number:string;kind:string;origin:string;house:string;
  court:string;unit:string;answered:string;read:string;text:string;group:string;
};
export const EMPTY_ORIGINAL_MAIL_FILTERS:OriginalMailFilters={
  box:'',number:'',kind:'',origin:'',house:'',
  court:'',unit:'',answered:'',read:'',text:'',group:'',
};
export type OriginalMailOption={id:string;label:string};
export type OriginalMailOptions={
  readOnly:true;verifiedViewerScope:true;
  houses:OriginalMailOption[];weeks:number[];
  courts:OriginalMailOption[];units:OriginalMailOption[];
  rounds:{number:number;status:string}[];
};
/** Exactly the archived SQL filter names; local group selection never grants a House. */
export function toFirebaseOriginalMailFilters(
  filters:OriginalMailFilters,options:OriginalMailOptions,admin:boolean,
){
  const {group,...rest}=filters;
  const safe={...rest,text:rest.text.slice(0,256)};
  if(admin&&group){
    return {...safe,group_house_ids:narrationHouseIds(group,
      options.houses.map(h=>h.id))};
  }
  return safe;
}
