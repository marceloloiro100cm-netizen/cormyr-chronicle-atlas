import {defineTool} from '@lovable.dev/mcp-js';
import {supabaseForUser} from '../supabase';
export default defineTool({
 name:'opcoes_missivas',title:'Cadastros para missivas',
 description:'Lista jogadores destinatários e casas autorizadas com membros da corte e unidades militares. Não expõe e-mails, fichas completas ou personagens privados de outras casas.',
 inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async(_input,ctx)=>{const {data,error}=await supabaseForUser(ctx).rpc('mail_compose_options');if(error)throw error;return {content:[{type:'text',text:'Cadastros autorizados para selecionar os vínculos e destinatários.'}],structuredContent:{opcoes:data}};}
});
