import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';
import {mailIdempotencyKey} from '../idempotency';
export default defineTool({
 name:'escrever_missiva',title:'Escrever missiva',
 description:'Envia missivas para casas nobres ou, quando remetente é jogador, diretamente ao Narrador para contato com NPCs. Cartas entre casas ficam visíveis ao Narrador sem cópia duplicada.',
 inputSchema:{data_campanha:z.string().describe("Data de Harptos obrigatória: AAAA-MM-DD, dias 01–30, ou AAAA-F-midwinter/greengrass/midsummer/shieldmeet/highharvestide/feast-moon. Shieldmeet apenas em anos divisíveis por 4."),
 chave_envio:z.string().uuid().optional().describe('UUID opcional para uma nova operação; se ausente a ferramenta deriva uma chave determinística, segura para retentativas.'),
 casa_remetente:z.string().optional(),
 casas:z.array(z.string()).optional(),
 narrador:z.boolean().optional().describe('Apenas jogadores: envia exclusivamente ao Narrador; não combine com casas.'),
 assunto:z.string().min(1),conteudo:z.string().min(1),
 membro_corte:z.string().optional(),unidade_militar:z.string().optional(),
 responsabilidade:z.enum(['executor','order_recipient']).optional(),
 assinado_por:z.string().max(120).optional().describe('NPC ou cargo diegético, disponível somente ao Narrador.'),
 rascunho:z.boolean().optional(),
 numero:z.number().int().positive().optional().describe('Semana de entrega, usada pelo Narrador; não é um número individual da mensagem.')
 },
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 handler:async({data_campanha,chave_envio,casa_remetente,casas,narrador,assunto,conteudo,membro_corte,unidade_militar,responsabilidade,assinado_por,rascunho,numero},ctx)=>{
 if(narrador&&(casas??[]).length)throw new ToolError('Escolha o Narrador ou as casas, nunca ambos.');
 if(!narrador&&!(casas??[]).length)throw new ToolError('Selecione o Narrador ou ao menos uma casa.');
 const targets=narrador?['narrator']:(casas??[]).map(h=>'h:'+h);
 const key=chave_envio??await mailIdempotencyKey({action:'send_linked_mail',date:data_campanha,targets:targets.slice().sort(),origin:casa_remetente??null,assunto,conteudo,membro_corte,unidade_militar,responsabilidade,assinado_por,rascunho,numero});
 const {data,error}=await supabaseForUser(ctx).rpc('dated_mail_action',{p_action:'send_linked_mail',p_date:data_campanha,p_args:{p_key:key,p_origin:casa_remetente??null,p_targets:targets,p_subject:assunto,p_content:conteudo,p_court:membro_corte??null,p_unit:unidade_militar??null,p_role:membro_corte?(responsabilidade??'executor'):null,p_draft:rascunho??false,p_week:numero??null,p_signed_by:assinado_por??null}});
 if(error)throw new ToolError(error.message);
 return {content:[{type:'text',text:'Operação registrada. Confira a situação e a semana no resultado.'}],structuredContent:{resultado:data,chave_envio:key}};
 }
});
