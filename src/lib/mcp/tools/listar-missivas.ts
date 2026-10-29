import {defineTool} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';
export default defineTool({
 name:'listar_missivas',title:'Listar missivas',
 description:'Pesquisa missivas e respostas autorizadas, com paginação, semana de atividade e vínculos com corte e unidades.',
 inputSchema:{casa:z.string().optional(),origem:z.string().optional(),membro_corte:z.string().optional().describe('Chave casa:id ou none para sem vínculo.'),unidade_militar:z.string().optional().describe('Chave casa:id ou none para sem vínculo.'),semana:z.number().int().positive().optional(),texto:z.string().optional(),pagina:z.number().int().nonnegative().optional(),limite:z.number().int().min(1).max(50).optional()},
 annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async({casa,origem,membro_corte,unidade_militar,semana,texto,pagina,limite},ctx)=>{
 const {data,error}=await supabaseForUser(ctx).rpc('mail_page',{p_filters:{house:casa??'',origin:origem??'',court:membro_corte??'',unit:unidade_militar??'',number:semana?String(semana):'',text:texto??''},p_page:pagina??0,p_size:limite??20});
 if(error)throw error;
 return {content:[{type:'text',text:'Página de missivas visíveis ao usuário conectado.'}],structuredContent:{resultado:data}};
 }
});
