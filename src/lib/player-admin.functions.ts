import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const managePlayerAccount=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({
  playerId:z.string().uuid().optional(),name:z.string().min(1).max(160),email:z.string().email().optional(),password:z.string().min(6).max(200).optional(),houseId:z.string().min(1),active:z.boolean(),canEdit:z.boolean(),requireChange:z.boolean(),folderId:z.string().nullable(),
})).handler(async({data,context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');if(role.error||!role.data)throw new Error('Acesso restrito ao Narrador.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  let player=data.playerId?(await db.from('campaign_players').select('*').eq('id',data.playerId).single()).data:null;
  if(data.playerId&&!player)throw new Error('Jogador não encontrado; nenhuma conta foi alterada.');
  const catalog=await db.from('house_catalog').select('id,name,region,archive_data').eq('id',data.houseId).single();
  if(catalog.error||!catalog.data)throw new Error('Selecione uma casa do catálogo oficial.');
  const campaignHouse=await db.from('campaign_houses').select('id').eq('id',data.houseId).maybeSingle();
  if(campaignHouse.error)throw new Error('Não foi possível conferir a casa.');
  if(!campaignHouse.data){const added=await db.from('campaign_houses').insert({id:catalog.data.id,name:catalog.data.name,region:catalog.data.region,season:2,active:true,source:'catalog'});if(added.error)throw new Error('Casa não pôde ser associada à campanha.');}
  let userId=player?.user_id??null;
  if(data.email){
    const result=await db.auth.admin.listUsers({perPage:1000});if(result.error)throw new Error('Não foi possível consultar as contas.');
    if(result.data.users.length===1000)throw new Error('Lista de contas exige revisão antes de cadastrar.');
    const existing=result.data.users.find(u=>u.email?.toLowerCase()===data.email?.toLowerCase());
    if(userId&&!existing&&player)throw new Error('O e-mail informado não corresponde à conta vinculada; nenhuma senha foi alterada.');
    if(userId&&existing&&existing.id!==userId)throw new Error('Esse e-mail pertence a outra conta.');
    userId=existing?.id??userId;
    if(!userId){if(!data.password)throw new Error('Defina a senha inicial.');const created=await db.auth.admin.createUser({email:data.email,password:data.password,email_confirm:false});if(created.error||!created.data.user)throw new Error('O provedor não aceitou o cadastro; nenhuma permissão foi concedida.');userId=created.data.user.id;}
  }
  if(data.password&&userId){const updated=await db.auth.admin.updateUserById(userId,{password:data.password});if(updated.error)throw new Error('O provedor não aceitou a nova senha; o acesso anterior foi preservado.');}
  if(!player&&userId){const found=await db.from('campaign_players').select('*').eq('user_id',userId).maybeSingle();if(found.error)throw new Error('Vínculo duplicado exige revisão administrativa.');player=found.data;}
  const saved=player?await db.from('campaign_players').update({name:data.name,active:data.active,require_password_change:data.requireChange,roster_house_id:data.houseId,folder_id:data.folderId,user_id:userId}).eq('id',player.id).select().single():await db.from('campaign_players').insert({name:data.name,active:data.active,require_password_change:data.requireChange,roster_house_id:data.houseId,folder_id:data.folderId,user_id:userId}).select().single();
  if(saved.error||!saved.data)throw new Error('Conta preservada; cadastro do jogador ficou pendente.');
  const link=await db.from('house_memberships').upsert({player_id:saved.data.id,house_id:data.houseId,can_edit:data.canEdit,authorized_by:context.userId});if(link.error)throw new Error('Jogador salvo; autorização da casa ficou pendente.');
  const audit=await db.from('campaign_admin_audit').insert({actor:context.userId,target_player:saved.data.id,action:data.password?'account_password_set':'player_management',details:{active:data.active,requireChange:data.requireChange,houseId:data.houseId}});if(audit.error)throw new Error('Operação executada; registro administrativo pendente.');
  return {message:'Jogador e autorização atualizados. Nenhuma senha atual foi consultada.',playerId:saved.data.id};
});
export const completePasswordChange=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({password:z.string().min(8).max(200)})).handler(async({data,context})=>{
  const update=await context.supabase.auth.updateUser({password:data.password});if(update.error)throw new Error('O provedor não aceitou a alteração.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const result=await db.from('campaign_players').update({require_password_change:false}).eq('user_id',context.userId);if(result.error)throw new Error('Senha atualizada; liberação da campanha pendente.');
  return {message:'Senha alterada.'};
});