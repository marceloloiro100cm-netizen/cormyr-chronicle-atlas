import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {blankChronicleSheet,chronicleStats,serializeChronicleSheet,CHARACTER_SKILLS,type ChronicleSheet} from '@/lib/house/character-sheet';
import type {RecordRow} from '@/components/players/shared';

export function ChronicleCharacterEditor({row,initial,houseId,houseName,playerId,canEdit,statusCap,onSave}:{
 row?:RecordRow;initial?:ChronicleSheet;houseId:string;houseName:string;playerId?:string;
 canEdit:boolean;statusCap:number;onSave:()=>unknown;
}){
 const [sheet,setSheet]=useState<ChronicleSheet>(()=>initial??{...blankChronicleSheet(),role:'Lorde / Herdeiro'});
 const [editing,setEditing]=useState(!row),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [privateSheet,setPrivateSheet]=useState(Boolean(playerId)&&!row);
 const stats=chronicleStats(sheet);
 const set=(patch:Partial<ChronicleSheet>)=>setSheet(s=>({...s,...patch}));
 async function save(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   if(sheet.skills['Status']>statusCap)throw new Error('Status excede a Influência autorizada da Casa (Tabela 6-5).');
   const content=serializeChronicleSheet(sheet);
   if(row){
    const result=await supabase.rpc('save_campaign_record',{p_id:row.id,p_version:row.version,p_title:'Ficha do Personagem — '+sheet.name.trim(),p_content:content});
    if(result.error)throw result.error;
   }else{
    const user=await supabase.auth.getUser();
    if(!user.data.user)throw new Error('Sessão expirada.');
    const inserted=await supabase.from('campaign_records').insert({
      id:crypto.randomUUID(),house_id:houseId,kind:'character',
      title:'Ficha do Personagem — '+sheet.name.trim(),content,
      visibility:privateSheet&&playerId?'player':'house',player_id:privateSheet&&playerId?playerId:null,
      created_by:user.data.user.id,updated_by:user.data.user.id
    });
    if(inserted.error)throw inserted.error;
   }
   setMessage('Ficha de personagem gravada no site; sincronização acionada.');
   setEditing(false);onSave();
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar a ficha.');}
  finally{setBusy(false);}
 }
 return <article className="house-panel">
 <div className="house-section-heading"><h3>{row?sheet.name||row.title:'Novo personagem de '+houseName}</h3>{row&&canEdit&&<Button variant="outline" onClick={()=>setEditing(e=>!e)}>{editing?'Fechar editor':'Editar personagem'}</Button>}</div>
 <p role="status">{message}</p>
 <p>{sheet.role} · Pontos de Destino: {sheet.destiny-sheet.spentDestiny} disponíveis de {sheet.destiny} · XP gasto informado: {sheet.xpSpent}</p>
 <dl className="house-grid"><div><dt>Defesa de Intriga</dt><dd>{stats.intrigueDefense}</dd></div><div><dt>Compostura</dt><dd>{stats.composure}</dd></div><div><dt>Defesa de Combate</dt><dd>{stats.combatDefense}</dd></div><div><dt>Saúde</dt><dd>{stats.health}</dd></div><div><dt>Movimento declarado</dt><dd>{stats.movement} m</dd></div></dl>
 {sheet.skills['Status']>statusCap&&<p role="alert" className="house-warning">O Status da personagem excede o teto {statusCap} autorizado pela Influência da Casa.</p>}
 {editing&&canEdit&&<form className="campaign-form" onSubmit={e=>{e.preventDefault();void save();}}>
 <div className="house-input-grid">
  <label>Nome do personagem<input required maxLength={160} value={sheet.name} onChange={e=>set({name:e.target.value})}/></label>
  <label>Função na Casa<input maxLength={160} value={sheet.role} onChange={e=>set({role:e.target.value})}/></label>
 </div>
 {!row&&playerId&&<label className="campaign-check"><input type="checkbox" checked={privateSheet} onChange={e=>setPrivateSheet(e.target.checked)}/>Ficha privada deste jogador</label>}
 <h4>Habilidades · Chronicle System</h4><div className="house-input-grid">{CHARACTER_SKILLS.map(key=><label key={key}>{key}
 <input type="number" min={1} max={key==='Status'?Math.min(10,statusCap):10} value={sheet.skills[key]}
 onChange={e=>setSheet(s=>({...s,skills:{...s.skills,[key]:Number(e.target.value)}}))}/></label>)}</div>
 <h4>Especialidades, Destino e personalidade</h4>
 <label>Especialidades e dados de bônus (descrição individual)<textarea value={sheet.specialties} onChange={e=>set({specialties:e.target.value})} placeholder="Ex.: Luta (espadas) +1B"/></label>
 <div className="house-input-grid">
  <label>Astúcia (Defesa de Intriga)<input type="number" min={1} max={10} value={sheet.cunning} onChange={e=>set({cunning:Number(e.target.value)})}/></label>
  <label>Escudo (+ Defesa)<input type="number" min={0} value={sheet.shield} onChange={e=>set({shield:Number(e.target.value)})}/></label>
  <label>Penalidade de armadura<input type="number" min={0} value={sheet.armorPenalty} onChange={e=>set({armorPenalty:Number(e.target.value)})}/></label>
  <label>Movimento (em metros; confirmar com Narrador)<input type="number" min={0} value={sheet.movement} onChange={e=>set({movement:Number(e.target.value)})}/></label>
  <label>Pontos de Destino totais<input type="number" min={0} value={sheet.destiny} onChange={e=>set({destiny:Number(e.target.value)})}/></label>
  <label>Destino gasto<input type="number" min={0} value={sheet.spentDestiny} onChange={e=>set({spentDestiny:Number(e.target.value)})}/></label>
  <label>XP gasto (conforme aprovações)<input type="number" min={0} value={sheet.xpSpent} onChange={e=>set({xpSpent:Number(e.target.value)})}/></label>
 </div>
 <label>Qualidades<textarea value={sheet.qualities} onChange={e=>set({qualities:e.target.value})}/></label>
 <label>Defeitos<textarea value={sheet.flaws} onChange={e=>set({flaws:e.target.value})}/></label>
 <p className="house-caption">Saúde, Compostura e Defesas são recalculadas automaticamente. XP investido, Movimento e especialidades dependem dos custos e decisões registrados pelo Narrador; não são presumidos.</p>
 <Button disabled={busy||sheet.skills['Status']>statusCap||!sheet.name.trim()}>{busy?'Salvando…':'Salvar ficha estruturada'}</Button>
 </form>}
 {!editing&&<details className="house-ledger"><summary>Habilidades e especialidades</summary>{CHARACTER_SKILLS.map(key=><p key={key}>{key}: {sheet.skills[key]}</p>)}<p>{sheet.specialties||'Sem especialidades registradas'}</p><p>Qualidades: {sheet.qualities||'—'}</p><p>Defeitos: {sheet.flaws||'—'}</p></details>}
 </article>;
}
