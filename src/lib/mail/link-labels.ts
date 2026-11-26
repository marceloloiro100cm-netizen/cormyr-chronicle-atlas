import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';

export type MailLinkOptionHouse={
 id:string;
 name:string;
 court?:{id:string;name:string;role:string}[];
 units?:{id:string;name:string;available:boolean}[];
};

export function useMailLinkCatalog(enabled=true){
 return useQuery({
  queryKey:['mail-options'],
  enabled,
  queryFn:async()=>{
   const r=await supabase.rpc('mail_compose_options');
   if(r.error)throw r.error;
   return r.data as unknown as {houses?:MailLinkOptionHouse[]} | null;
  },
  staleTime:30000,
 });
}

export function resolveLinkNames(
 houses:MailLinkOptionHouse[]|undefined,
 courtId:string|null|undefined,
 unitId:string|null|undefined,
):{courtLabel:string|null;unitLabel:string|null}{
 if(!houses?.length)return {courtLabel:null,unitLabel:null};
 let courtLabel:string|null=null;
 let unitLabel:string|null=null;
 for(const h of houses){
  if(courtId&&!courtLabel){
   const member=h.court?.find(c=>c.id===courtId);
   if(member)courtLabel=member.role?`${member.name} · ${member.role}`:member.name;
  }
  if(unitId&&!unitLabel){
   const unit=h.units?.find(u=>u.id===unitId);
   if(unit)unitLabel=unit.name;
  }
  if((!courtId||courtLabel)&&(!unitId||unitLabel))break;
 }
 return {courtLabel,unitLabel};
}

const SIG_KEY='chancelaria:narrator-signatures';
export function loadRecentSignatures():string[]{
 try{
  const raw=localStorage.getItem(SIG_KEY);
  const parsed=raw?JSON.parse(raw):[];
  return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==='string'&&Boolean(x.trim())).slice(0,8):[];
 }catch{return [];}
}
export function rememberSignature(name:string){
 const clean=name.trim();
 if(!clean)return;
 try{
  const next=[clean,...loadRecentSignatures().filter(s=>s.toLowerCase()!==clean.toLowerCase())].slice(0,8);
  localStorage.setItem(SIG_KEY,JSON.stringify(next));
 }catch{/* armazenamento indisponível */}
}
