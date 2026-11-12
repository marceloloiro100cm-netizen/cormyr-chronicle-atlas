import { StorageExport } from './storage-export';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerAccountForm } from '@/components/player-account-form';
import { LeonardoAccountProvision } from './leonardo-account-provision';
import { Button } from '@/components/ui/button';
import { registerPlayer } from '@/lib/campaign.functions';
import type { Panel } from './panel-data';
import { upsertTranslationsBatch } from '@/lib/i18n/i18n.functions';

export function AdminPanel({data,onSave}:{data:Panel;onSave:()=>unknown}){
  const register=useServerFn(registerPlayer),upsertTranslations=useServerFn(upsertTranslationsBatch);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selectedAccountPlayer,setSelectedAccountPlayer]=useState('');const mailKey=useRef<string|null>(null);
  const {data:profiles=[]}=useQuery({queryKey:['admin-profiles'],queryFn:async()=>{const {data,error}=await supabase.from('profiles').select('*');if(error)throw error;return data??[];}});
  async function action(fn:()=>Promise<unknown>){setBusy(true);setMessage('');try{await fn();onSave();setMessage('Salvo no site.');}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  return <section><h2>Administração da temporada</h2><p>{data.players.length} jogadores cadastrados · {data.houses.filter(h=>h.active&&h.season===2).length} casas ativas</p><p className="text-muted-foreground">Lista oficial cadastrada sem criar contas ou permissões. Grafias oficiais confirmadas: Silversky e Harcourt, já vinculadas ao acervo. Lordes e jogadores são exibidos conforme o cadastro da ficha, sem presumir ausência de lorde.</p>
    <details className="campaign-add" open><summary>Cadastrar jogador e autorizar casa</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(()=>register({data:{name:String(f.get('name')),userId:String(f.get('user'))||null,houseId:String(f.get('house')),folderId:String(f.get('folder'))||null,canEdit:f.get('edit')==='on'}}));}}><label>Jogador<input name="name" required/></label><label>Conta autenticada<select name="user"><option value="">Ainda sem conta vinculada</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.display_name||'Conta'} · {p.id}</option>)}</select></label><label>Casa<select name="house" required>{data.houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>ID da pasta individual no Drive<input name="folder"/></label><label className="campaign-check"><input name="edit" type="checkbox" defaultChecked/>Pode editar informações autorizadas</label><Button disabled={busy}>Cadastrar e autorizar</Button></form></details>
    <StorageExport/>
    <LeonardoAccountProvision onSave={onSave}/>
    <PlayerAccountForm houses={data.catalog} onSave={onSave}/><div className="campaign-add"><label htmlFor="admin-player-account-select">Gerenciamento de situação de conta e jogador</label><select id="admin-player-account-select" value={selectedAccountPlayer} onChange={e=>setSelectedAccountPlayer(e.target.value)}><option value="">Selecione um jogador para gerenciar</option>{data.players.filter(p=>p.roster_house_id!=='espiao'&&p.name.trim().toLocaleLowerCase('pt-BR')!=='leonardo').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=><option key={p.id} value={p.id}>{p.name} · {data.houses.find(h=>h.id===p.roster_house_id)?.name??'Sem casa'}</option>)}</select>{data.players.filter(p=>p.id===selectedAccountPlayer&&p.name.trim().toLocaleLowerCase('pt-BR')!=='leonardo').map(p=><PlayerAccountForm key={p.id} houses={data.catalog} player={p} canEdit={data.members.find(m=>m.player_id===p.id&&m.house_id===p.roster_house_id)?.can_edit??false} canEditAttributes={data.members.find(m=>m.player_id===p.id&&m.house_id===p.roster_house_id)?.can_edit_attributes??false} onSave={onSave}/>)}</div><details className="campaign-add"><summary>Adicionar casa confirmada da temporada</summary><form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const {error}=await supabase.from('campaign_houses').insert({id:String(f.get('id')),name:String(f.get('name')),castle:String(f.get('castle'))||null,source:String(f.get('source'))});if(error)throw error;});}}><label>ID estável<input name="id" required pattern="[a-z0-9-]+"/></label><label>Casa<input name="name" required/></label><label>Castelo<input name="castle"/></label><label>Fonte que confirma participação<input name="source" required/></label><Button disabled={busy}>Adicionar casa</Button></form></details>
    <details className="campaign-add">
      <summary>Traduções do site (EN / ES / DE)</summary>
      <form className="campaign-form">
        <label>
          Arquivo JSON
          <input type="file" accept=".json" disabled={busy} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            action(async () => {
              const items = JSON.parse(await file.text());
              if (!Array.isArray(items)) throw new Error('O arquivo deve conter uma lista JSON.');
              const result = await upsertTranslations({ data: { items } });
              setMessage(result.message);
            });
          }} />
        </label>
        <p className="house-caption">Envie um JSON contendo uma lista de objetos com `entity_type`, `entity_id`, `field_name`, `locale` e `translated_text`.</p>
      </form>
    </details>
    <p role="status">{message}</p>
  </section>;
}
