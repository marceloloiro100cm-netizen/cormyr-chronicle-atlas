import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerAccountForm } from '@/components/player-account-form';
import { Button } from '@/components/ui/button';
import { registerPlayer, retryFolderSync, organizeDriveFiles } from '@/lib/campaign.functions';
import { DriveSyncAdmin } from '@/components/drive-sync-admin';
import { date } from './shared';
import type { Panel } from './panel-data';

export function AdminPanel({data,onSave}:{data:Panel;onSave:()=>unknown}){
  const register=useServerFn(registerPlayer),retry=useServerFn(retryFolderSync),organize=useServerFn(organizeDriveFiles);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);const mailKey=useRef<string|null>(null);
  const {data:queue=[]}=useQuery({queryKey:['sync-queue'],queryFn:async()=>{const {data,error}=await supabase.from('sync_outbox').select('id,entity_type,state,error,created_at,attempts').order('created_at',{ascending:false});if(error)throw error;return data??[];}});
  const {data:profiles=[]}=useQuery({queryKey:['admin-profiles'],queryFn:async()=>{const {data,error}=await supabase.from('profiles').select('*');if(error)throw error;return data??[];}});
  async function action(fn:()=>Promise<unknown>){setBusy(true);setMessage('');try{await fn();onSave();setMessage('Salvo no site.');}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  return <section><h2>Administração da temporada</h2><p>{data.players.length} jogadores cadastrados · {data.houses.filter(h=>h.active&&h.season===2).length} casas ativas</p><p className="text-muted-foreground">Lista oficial cadastrada sem criar contas ou permissões. Grafias oficiais confirmadas: Silversky e Harcourt, já vinculadas ao acervo. Everlost permanece sem lorde.</p>
    <details className="campaign-add" open><summary>Cadastrar jogador e autorizar casa</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(()=>register({data:{name:String(f.get('name')),userId:String(f.get('user'))||null,houseId:String(f.get('house')),folderId:String(f.get('folder'))||null,canEdit:f.get('edit')==='on'}}));}}><label>Jogador<input name="name" required/></label><label>Conta autenticada<select name="user"><option value="">Ainda sem conta vinculada</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.display_name||'Conta'} · {p.id}</option>)}</select></label><label>Casa<select name="house" required>{data.houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>ID da pasta individual no Drive<input name="folder"/></label><label className="campaign-check"><input name="edit" type="checkbox" defaultChecked/>Pode editar informações autorizadas</label><Button disabled={busy}>Cadastrar e autorizar</Button></form></details>
    <details className="campaign-add"><summary>Importar jogadores (JSON)</summary><label>Arquivo<input type="file" accept=".json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;action(async()=>{const rows:unknown=JSON.parse(await file.text());if(!Array.isArray(rows)||rows.length>200)throw new Error('Use uma lista JSON de até 200 jogadores.');for(const row of rows){if(!row||typeof row!=='object'||!('name' in row)||!('houseId' in row))throw new Error('Cada jogador precisa de name e houseId.');await register({data:{name:String(row.name),houseId:String(row.houseId),userId:'userId' in row&&row.userId?String(row.userId):null,folderId:'folderId' in row&&row.folderId?String(row.folderId):null,canEdit:'canEdit' in row?Boolean(row.canEdit):true}});}});}}/></label><p>Campos: name, houseId, userId (opcional), folderId (opcional), canEdit.</p></details>
    <PlayerAccountForm houses={data.catalog} onSave={onSave}/>{data.players.map(p=><PlayerAccountForm key={p.id} houses={data.catalog} player={p} canEdit={data.members.find(m=>m.player_id===p.id&&m.house_id===p.roster_house_id)?.can_edit??false} onSave={onSave}/>)}
    <details className="campaign-add" open><summary>Conclusão das Missivas Semanais</summary>
      <div className="space-y-2 mt-2">
      {(()=>{
        const openRound = data.rounds.filter(r=>r.status==='open').sort((a,b)=>b.number-a.number)[0]?.number;
        if (!openRound) return <p>Nenhuma semana aberta.</p>;
        const activePlayers = data.players.filter(p=>p.active);
        const completions = data.completions?.filter(c=>c.week===openRound) ?? [];
        const completedCount = activePlayers.filter(p=>completions.find(c=>c.player_id===p.id)?.status==='completed').length;
        return (
          <>
            <p><strong>Semana atual: {openRound}</strong></p>
            <p><strong>{completedCount} de {activePlayers.length}</strong> jogadores finalizaram a participação na rodada.</p>
            <div className="grid gap-2 border p-2 bg-zinc-50 dark:bg-zinc-900 rounded-md">
              <div className="grid grid-cols-4 font-bold border-b pb-1 text-sm">
                <div>Jogador</div><div>Casa</div><div>Situação</div><div>Ações</div>
              </div>
              {activePlayers.map(p => {
                const comp = completions.find(c => c.player_id === p.id);
                const isCompleted = comp?.status === 'completed';
                const houseIds = data.members.filter(m=>m.player_id===p.id).map(m=>m.house_id).join(', ') || p.roster_house_id;

                // check if new letters arrived after completion
                let newMessagesWarning = false;
                if (isCompleted && comp?.completed_at) {
                  const compTime = new Date(comp.completed_at).getTime();
                  const p_my_houses = data.members.filter(m=>m.player_id===p.id).map(m=>m.house_id);
                  if (p.roster_house_id) p_my_houses.push(p.roster_house_id);
                  const newLetters = data.letters.filter(l => (l.recipient_player_id === p.id || p_my_houses.includes(l.recipient_house_id??'')) && l.delivery_week === openRound && new Date(l.delivered_at ?? l.created_at).getTime() > compTime);
                  const newReplies = data.replies.filter(r => {
                    if ((r as any).author_user_id === p.user_id || (r as any).delivery_week !== openRound) return false;
                    if (new Date(r.delivered_at ?? r.created_at ?? '').getTime() <= compTime) return false;
                    const original = data.letters.find(l => l.id === r.letter_id);
                    if (!original) return false;
                    return original.sender_user_id === p.user_id || original.recipient_player_id === p.id || p_my_houses.includes(original.recipient_house_id??'');
                  });
                  newMessagesWarning = newLetters.length > 0 || newReplies.length > 0;
                }

                return (
                  <div key={p.id} className="grid grid-cols-4 items-center text-sm border-b pb-1 last:border-0">
                    <div>{p.name}</div>
                    <div className="text-muted-foreground">{houseIds}</div>
                    <div className="flex flex-col text-xs">
                      {isCompleted ? <span className="text-emerald-600 font-medium">Finalizado</span> : <span className="text-amber-600">Em andamento</span>}
                      {comp?.completed_at && isCompleted && <span>{date(comp.completed_at)}</span>}
                      {newMessagesWarning && <span className="text-destructive font-bold text-[10px]">Novas msg!</span>}
                    </div>
                    <div>
                      <Button size="sm" variant="outline" disabled={busy} className="h-6 text-xs px-2" onClick={()=>action(async()=>{
                        const {error} = isCompleted
                          ? await supabase.rpc('resume_weekly_letters', {p_player: p.id, p_week: openRound, p_actor: data.user.id})
                          : await supabase.rpc('complete_weekly_letters', {p_player: p.id, p_week: openRound, p_actor: data.user.id});
                        if (error) throw error;
                      })}>
                        {isCompleted ? 'Retomar' : 'Finalizar'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
      </div>
    </details>
    <h3>Jogadores e vínculos autorizados</h3>{data.players.length===0?<p>Nenhum nome de jogador confirmado nas fontes locais.</p>:data.players.map(p=><details className="campaign-add" key={p.id}><summary>{p.name} · {data.members.filter(m=>m.player_id===p.id).map(m=>data.houses.find(h=>h.id===m.house_id)?.name).join(', ')||('Casa oficial: '+(data.houses.find(h=>h.id===p.roster_house_id)?.name??'Não informada')+' · acesso não autorizado')}</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const {error}=await supabase.from('campaign_players').update({name:String(f.get('name')),user_id:String(f.get('user'))||null,folder_id:String(f.get('folder'))||null,details:String(f.get('details'))}).eq('id',p.id);if(error)throw error;});}}><p><strong>Casa oficial:</strong> {data.houses.find(h=>h.id===p.roster_house_id)?.name??'Não informada'} · <strong>Lorde:</strong> {p.lord_name??'Não informado'}</p><label>Nome<input name="name" defaultValue={p.name} required/></label><label>Conta<select name="user" defaultValue={p.user_id??''}><option value="">Não vinculada</option>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.display_name||profile.id}</option>)}</select></label><label>Pasta individual<input name="folder" defaultValue={p.folder_id??''}/></label><label>Detalhes<textarea name="details" defaultValue={p.details}/></label><Button disabled={busy}>Salvar jogador</Button></form><div className="campaign-actions">{data.members.filter(m=>m.player_id===p.id).map(m=><Button key={m.house_id} disabled={busy} variant="outline" onClick={()=>action(async()=>{const {error}=await supabase.from('house_memberships').delete().eq('player_id',p.id).eq('house_id',m.house_id);if(error)throw error;})}>Revogar {m.house_id}</Button>)}</div><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const {error}=await supabase.from('house_memberships').upsert({player_id:p.id,house_id:String(f.get('house')),can_edit:f.get('edit')==='on',authorized_by:data.user.id});if(error)throw error;});}}><label>Autorizar / ajustar casa<select name="house">{data.houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label className="campaign-check"><input name="edit" type="checkbox" defaultChecked/>Permitir edição</label><Button disabled={busy}>Salvar permissão</Button></form></details>)}
    <h3>Casas, castelos e pastas</h3>{data.houses.map(h=><details className="campaign-add" key={h.id}><summary>{h.name}{!h.active?' · registro anterior inativo':''} · {h.castle??'Castelo não informado'}</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const {error}=await supabase.from('campaign_houses').update({name:String(f.get('name')),castle:String(f.get('castle'))||null,details:String(f.get('details')),lord_name:String(f.get('lord'))||null,review_note:String(f.get('review'))||null,region:String(f.get('region'))||null,folder_id:String(f.get('folder'))||null}).eq('id',h.id);if(error)throw error;});}}><label>Casa<input name="name" defaultValue={h.name} required/></label><label>Lorde<input name="lord" defaultValue={h.lord_name??''}/></label><label>Região<input name="region" defaultValue={h.region??''}/></label><label>Revisão administrativa<textarea name="review" defaultValue={h.review_note??''}/></label><label>Castelo<input name="castle" defaultValue={h.castle??''}/></label><label>Pasta compartilhada (ID do Drive)<input name="folder" defaultValue={h.folder_id??''}/></label><label>Detalhes<textarea name="details" defaultValue={h.details}/></label><Button disabled={busy}>Salvar casa</Button></form></details>)}
    <details className="campaign-add"><summary>Adicionar casa confirmada da temporada</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const {error}=await supabase.from('campaign_houses').insert({id:String(f.get('id')),name:String(f.get('name')),castle:String(f.get('castle'))||null,source:String(f.get('source'))});if(error)throw error;});}}><label>ID estável<input name="id" required pattern="[a-z0-9-]+"/></label><label>Casa<input name="name" required/></label><label>Castelo<input name="castle"/></label><label>Fonte que confirma participação<input name="source" required/></label><Button disabled={busy}>Adicionar casa</Button></form></details>
    <h3>Sincronização e falhas</h3><Button variant="outline" disabled={busy} onClick={()=>{if(confirm('Organizar somente arquivos técnicos confirmados, preservando documentos pessoais e narrativos?'))action(async()=>{const result=await organize();setMessage(result.message);});}}>Organizar arquivos técnicos</Button><p>Somente pastas confirmadas, revisadas e autorizadas são processadas. Novos arquivos exigem revisão; segredos do mestre permanecem no site.</p><Button disabled={busy} variant="outline" onClick={async()=>{setBusy(true);try{const result=await retry();setMessage(result.message);onSave();}catch(e){setMessage(e instanceof Error?e.message:'Falha na execução.');}finally{setBusy(false);}}}>Executar / retentar pastas autorizadas</Button><DriveSyncAdmin/><div className="campaign-queue">{queue.length===0?<p>Fila vazia.</p>:queue.map(q=><div key={q.id}><strong>{q.entity_type}</strong> · {q.state} · {q.attempts} tentativas · {date(q.created_at)}{q.error&&<p>{q.error}</p>}</div>)}</div><p><a href="/cormyr/player-sync-format.md" target="_blank" rel="noopener">Formato de arquivos e requisitos de conexão</a></p><p role="status">{message}</p>
  </section>;
}
