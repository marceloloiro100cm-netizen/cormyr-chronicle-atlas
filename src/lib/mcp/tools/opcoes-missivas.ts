import {defineTool} from '@lovable.dev/mcp-js';
import {supabaseForUser} from '../supabase';
export default defineTool({
 name:'opcoes_missivas',title:'Cadastros para missivas',
 description:'Lista as casas destinatárias. Jogadores também podem escolher narrador=true na ferramenta escrever_missiva para NPCs; a consulta nunca oferece destinatários individuais.',
 inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async(_input,ctx)=>{const {data,error}=await supabaseForUser(ctx).rpc('mail_compose_options');if(error)throw error;return {content:[{type:'text',text:'Cadastros autorizados para selecionar os vínculos e destinatários.'}],structuredContent:{opcoes:{houses:(data as {houses?:unknown[]}|null)?.houses??[],destinatario_narrador_para_jogadores:true}}};}
});
