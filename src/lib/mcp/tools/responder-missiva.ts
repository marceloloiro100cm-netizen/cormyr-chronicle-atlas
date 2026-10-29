import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';
export default defineTool({
 name:'responder_missiva',title:'Responder missiva',
 description:'Responde a uma missiva ou resposta específica. A entrega segue a semana calculada no servidor; só respostas entregues contam como respondidas. Repita a mesma chave e o mesmo texto em caso de falha de rede.',
 inputSchema:{data_campanha:z.string().describe("Data de Harptos obrigatória: AAAA-MM-DD, dias 01–30, ou AAAA-F-midwinter/greengrass/midsummer/shieldmeet/highharvestide/feast-moon. Shieldmeet apenas em anos divisíveis por 4."),missiva_id:z.string().uuid(),resposta_id:z.string().uuid().optional(),chave_envio:z.string().uuid().describe('UUID estável da operação.'),conteudo:z.string().min(1)},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 handler:async({data_campanha,missiva_id,resposta_id,chave_envio,conteudo},ctx)=>{
 const {data,error}=await supabaseForUser(ctx).rpc('dated_mail_action',{p_action:'reply_weekly_message',p_date:data_campanha,p_args:{p_letter:missiva_id,p_reply:(resposta_id??null) as unknown as string,p_content:conteudo,p_key:chave_envio,p_draft:false}});
 if(error)throw new ToolError(error.message);
 return {content:[{type:'text',text:'Resposta registrada. A entrega depende da semana da campanha.'}],structuredContent:{resultado:data}};
 }
});
