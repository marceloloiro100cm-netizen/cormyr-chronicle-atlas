export function effectiveCloudMail<T>(v:T,openRound:number|null|undefined):T;
export function deliveryOptions(v:Record<string,unknown>,deny:()=>never):Record<string,unknown>;
export function deliveryPlan(role:string,opts:{draft?:boolean;deliveryRound?:number|null},round:number):
  {state:'draft'|'delivered'|'scheduled';deliveryRound:number|null;error?:undefined}|{error:string};
