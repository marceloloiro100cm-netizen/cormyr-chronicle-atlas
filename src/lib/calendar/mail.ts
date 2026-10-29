import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
export function datedMail(action:string,args:Json,date:string){
 return supabase.rpc('dated_mail_action',{p_action:action,p_args:args,p_date:date});
}
