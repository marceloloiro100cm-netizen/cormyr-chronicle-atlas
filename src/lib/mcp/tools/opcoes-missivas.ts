import {defineTool} from '@lovable.dev/mcp-js';
import {supabaseForUser} from '../supabase';
export default defineTool({
 name:'opcoes_missivas',title:'Cadastros para missivas',
 description:'Lista somente casas destinatárias autorizadas, com membros da corte e unidades militares opcionais. Não oferece envio a jogadores individuais ou ao Narrador.',
 inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async(_input,ctx)=>{const {data,error}=await supabaseForUser(ctx).rpc('mail_compose_options');if(error)throw error;return {content:[{type:'text',text:'Cadastros autorizados para selecionar os vínculos e destinatários.'}],structuredContent:{opcoes:{houses:(data as {houses?:unknown[]}|null)?.houses??[]}}};}
});
