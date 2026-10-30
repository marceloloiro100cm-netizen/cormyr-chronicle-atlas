import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';
import {mailIdempotencyKey} from '../idempotency';
export default defineTool({
 name:'escrever_missiva',title:'Escrever missiva',
 description:'Envia entregas privadas individuais para jogadores, casas ou Narrador, com vínculos opcionais da ficha. Consulte opcoes_missivas para IDs válidos. Repita a mesma chave e o mesmo conteúdo em caso de falha de rede.',
 inputSchema:{data_campanha:z.string().describe("Data de Harptos obrigatória: AAAA-MM-DD, dias 01–30, ou AAAA-F-midwinter/greengrass/midsummer/shieldmeet/highharvestide/feast-moon. Shieldmeet apenas em anos divisíveis por 4."),
 chave_envio:z.string().uuid().optional().describe('UUID opcional para uma nova operação; se ausente a ferramenta deriva uma chave determinística, segura para retentativas.'),
 casa_remetente:z.string().optional(),
 jogadores:z.array(z.string().uuid()).optional(),
 casas:z.array(z.string()).optional(),
 narrador:z.boolean().optional(),
 assunto:z.string().min(1),conteudo:z.string().min(1),
 membro_corte:z.string().optional(),unidade_militar:z.string().optional(),
 responsabilidade:z.enum(['executor','order_recipient']).optional(),
 rascunho:z.boolean().optional(),
 numero:z.number().int().positive().optional().describe('Semana de entrega, usada pelo Narrador; não é um número individual da mensagem.')
 },
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 handler:async({data_campanha,chave_envio,casa_remetente,jogadores,casas,narrador,assunto,conteudo,membro_corte,unidade_militar,responsabilidade,rascunho,numero},ctx)=>{
 const targets=[...(jogadores??[]).map(p=>'p:'+p),...(casas??[]).map(h=>'h:'+h),...(narrador?['narrator']:[])];
 const key=chave_envio??await mailIdempotencyKey({action:'send_linked_mail',date:data_campanha,targets:targets.slice().sort(),origin:casa_remetente??null,assunto,conteudo,membro_corte,unidade_militar,responsabilidade,rascunho,numero});
 const {data,error}=await supabaseForUser(ctx).rpc('dated_mail_action',{p_action:'send_linked_mail',p_date:data_campanha,p_args:{p_key:key,p_origin:casa_remetente??null,p_targets:targets,p_subject:assunto,p_content:conteudo,p_court:membro_corte??null,p_unit:unidade_militar??null,p_role:membro_corte?(responsabilidade??'executor'):null,p_draft:rascunho??false,p_week:numero??null}});
 if(error)throw new ToolError(error.message);
 return {content:[{type:'text',text:'Operação registrada. Confira a situação e a semana no resultado.'}],structuredContent:{resultado:data,chave_envio:key}};
 }
});
