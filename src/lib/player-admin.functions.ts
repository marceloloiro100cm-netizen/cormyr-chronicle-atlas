import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const managePlayerAccount=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({
  playerId:z.string().uuid().optional(),name:z.string().min(1).max(160),email:z.string().email().optional(),password:z.string().min(6).max(200).optional(),houseId:z.string().min(1),active:z.boolean(),canEdit:z.boolean(),canEditAttributes:z.boolean(),requireChange:z.boolean(),folderId:z.string().nullable(),
})).handler(async({data,context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');if(role.error||!role.data)throw new Error('Acesso restrito ao Narrador.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  let player=data.playerId?(await db.from('campaign_players').select('*').eq('id',data.playerId).single()).data:null;
  if(data.playerId&&!player)throw new Error('Jogador não encontrado; nenhuma conta foi alterada.');
  // Acesso especial fora da temporada. Não é uma casa nobre do elenco oficial.
  // A escolha no login nunca substitui os vínculos conferidos por RLS.
  const special=data.houseId==='espiao';
  const catalog=special?null:await db.from('house_catalog').select('id,name,region,archive_data').eq('id',data.houseId).single();
  if(!special&&(catalog?.error||!catalog?.data))throw new Error('Selecione uma casa do catálogo oficial.');
  if(special){
    const existing=await db.from('house_catalog').select('id,classification,public_reviewed').eq('id','espiao').maybeSingle();
    if(existing.error)throw new Error('Não foi possível verificar o perfil especial.');
    if(existing.data&&(existing.data.classification!=='special'||existing.data.public_reviewed))
      throw new Error('Identificador especial já ocupado por registro público.');
    if(!existing.data){
      const inserted=await db.from('house_catalog').insert({
        id:'espiao',name:'Espião',region:'',classification:'special',archive_data:{},public_reviewed:false,
      });
      if(inserted.error)throw new Error('Não foi possível registrar o perfil especial.');
    }
  }
  const campaignHouse=await db.from('campaign_houses').select('id,name,season').eq('id',data.houseId).maybeSingle();
  if(campaignHouse.error)throw new Error('Não foi possível conferir a casa.');
  if(special&&campaignHouse.data&&(campaignHouse.data.season!==0||campaignHouse.data.name!=='Espião'))
    throw new Error('A identidade especial conflita com uma casa existente.');
  if(!campaignHouse.data){
    const added=await db.from('campaign_houses').insert(special
      ?{id:'espiao',name:'Espião',crest:'/house-flags/espiao.svg',region:'',season:0,active:true,source:'special-access'}
      :{id:catalog!.data!.id,name:catalog!.data!.name,region:catalog!.data!.region,season:2,active:true,source:'catalog'});
    if(added.error)throw new Error('Casa não pôde ser associada à campanha.');
  }
  let userId=player?.user_id??null;
  if(data.email){
    const result=await db.auth.admin.listUsers({perPage:1000});if(result.error)throw new Error('Não foi possível consultar as contas.');
    if(result.data.users.length===1000)throw new Error('Lista de contas exige revisão antes de cadastrar.');
    const existing=result.data.users.find(u=>u.email?.toLowerCase()===data.email?.toLowerCase());
    if(userId&&!existing&&player)throw new Error('O e-mail informado não corresponde à conta vinculada; nenhuma senha foi alterada.');
    if(userId&&existing&&existing.id!==userId)throw new Error('Esse e-mail pertence a outra conta.');
    userId=existing?.id??userId;
    if(!userId){if(!data.password)throw new Error('Defina a senha inicial.');const created=await db.auth.admin.createUser({email:data.email,password:data.password,email_confirm:true});if(created.error||!created.data.user)throw new Error('O provedor não aceitou o cadastro; nenhuma permissão foi concedida.');userId=created.data.user.id;}
  }
  if(data.password&&userId){const updated=await db.auth.admin.updateUserById(userId,{password:data.password});if(updated.error)throw new Error('O provedor não aceitou a nova senha; o acesso anterior foi preservado.');}
  if(!player&&userId){const found=await db.from('campaign_players').select('*').eq('user_id',userId).maybeSingle();if(found.error)throw new Error('Vínculo duplicado exige revisão administrativa.');player=found.data;}
  const saved=await db.rpc('admin_save_player_account',{p_actor:context.userId,p_player:player?.id??null as unknown as string,p_user:userId??null as unknown as string,p_name:data.name,p_house:data.houseId,p_active:data.active,p_edit:data.canEdit,p_change:data.requireChange,p_folder:data.folderId??null as unknown as string,p_password_set:Boolean(data.password)});
  if(saved.error)throw new Error(data.password?'Senha aceita pelo provedor; cadastro e autorização ficaram pendentes. Tente novamente.':'Conta preservada; cadastro e autorização ficaram pendentes.');
  // Separate grant for RPG point buy; regular can_edit is insufficient.
  const permission=await db.from('house_memberships')
   .update({can_edit_attributes:data.canEditAttributes&&data.canEdit,authorized_by:context.userId})
   .eq('player_id',String(saved.data)).eq('house_id',data.houseId).select('player_id').maybeSingle();
  if(permission.error||!permission.data)
    throw new Error('Conta atualizada, mas permissão de atributos pendente de confirmação do Narrador.');
  return {message:'Jogador e permissões de ficha e point buy atualizados.',playerId:saved.data};
});
export const completePasswordChange=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({password:z.string().min(8).max(200)})).handler(async({data,context})=>{
  const update=await context.supabase.auth.updateUser({password:data.password});if(update.error)throw new Error('O provedor não aceitou a alteração.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const result=await db.from('campaign_players').update({require_password_change:false}).eq('user_id',context.userId);if(result.error)throw new Error('Senha atualizada; liberação da campanha pendente.');
  return {message:'Senha alterada.'};
});