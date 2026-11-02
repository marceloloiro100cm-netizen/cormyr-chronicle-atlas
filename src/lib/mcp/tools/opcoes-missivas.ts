import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {supabaseForUser} from '../supabase';

/** Nunca devolver `unknown[]` em structuredContent nem promover registros
 * privados. O próprio RPC já filtra vínculos; este schema remove propriedades
 * inesperadas e recusa respostas malformadas. */
const optionsSchema=z.object({
 houses:z.array(z.object({
  id:z.string().min(1),name:z.string().min(1),
  version:z.number().int().nullable().optional(),
  court:z.array(z.object({
   id:z.string().min(1),name:z.string(),role:z.string(),
  })).default([]),
  units:z.array(z.object({
   id:z.string().min(1),name:z.string(),available:z.boolean(),
  })).default([]),
 })).default([]),
});
export default defineTool({
 name:'opcoes_missivas',title:'Cadastros para missivas',
 description:'Lista casas destinatárias e vínculos autorizados. Jogadores podem escolher o Narrador para NPCs; sem endereçamento individual.',
 inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},
 handler:async(_input,ctx)=>{
  const {data,error}=await supabaseForUser(ctx).rpc('mail_compose_options');
  if(error)throw new ToolError(error.message);
  const parsed=optionsSchema.safeParse(data);
  if(!parsed.success)throw new ToolError('Cadastros de missivas indisponíveis ou incompletos.');
  return {
   content:[{type:'text' as const,text:'Casas e vínculos autorizados para seleção de destinatários.'}],
   structuredContent:{
    opcoes:{houses:parsed.data.houses,destinatario_narrador_para_jogadores:true},
   },
  };
 },
});
