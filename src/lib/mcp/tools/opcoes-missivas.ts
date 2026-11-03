import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';

// The MCP transport accepts only JSON-compatible values, not unknown[].
// Preserve the house/court/unit options, while never exposing individual
// player recipient records or forwarding unchecked database objects.
const optionsSchema=z.object({
 houses:z.array(z.object({
  id:z.string().min(1),name:z.string().min(1),
  version:z.number().nullable().default(null),
  court:z.array(z.object({
   id:z.string(),name:z.string(),role:z.string(),
  })).default([]),
  units:z.array(z.object({
   id:z.string(),name:z.string(),available:z.boolean(),
  })).default([]),
 })),
});
export default defineTool({
 name:'opcoes_missivas',title:'Cadastros para missivas',
 description:'Lista as casas destinatárias. Jogadores também podem escolher narrador=true na ferramenta escrever_missiva para NPCs; a consulta nunca oferece destinatários individuais.',
 inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async(_input,ctx)=>{
  const {data,error}=await supabaseForUser(ctx).rpc('mail_compose_options');
  if(error)throw new ToolError(error.message);
  const options=optionsSchema.safeParse(data);
  if(!options.success)throw new ToolError('As opções de Casas retornadas pelo servidor são inválidas.');
  return {
   content:[{type:'text',text:'Cadastros autorizados para selecionar os vínculos e destinatários.'}],
   structuredContent:{opcoes:{
    houses:options.data.houses,
    destinatario_narrador_para_jogadores:true,
   }},
  };
 }
});
