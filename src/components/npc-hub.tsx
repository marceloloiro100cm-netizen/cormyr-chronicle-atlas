import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CampaignContent, ImagePicker, PrivateImage, uploadImages, type PendingImage } from '@/components/campaign-content';
import { isFichaPersonagem } from '@/lib/ficha';
import { parseNpc } from '@/lib/npc';
import type { Database } from '@/integrations/supabase/types';

type RecordRow = Database['public']['Tables']['campaign_records']['Row'];

export function CollapsibleText({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return <div className={'campaign-collapse' + (open ? '' : ' fechado')}>
    <div className="campaign-collapse-head">{title}<button type="button" className="campaign-collapse-toggle" aria-expanded={open} aria-label={open ? 'Reduzir texto' : 'Expandir texto'} onClick={() => setOpen(!open)}><ChevronDown size={18} />{open ? 'Reduzir' : 'Expandir'}</button></div>
    <div className="campaign-collapse-body">{children}</div>
  </div>;
}

export function NpcHub({ records, houseId, playerId, admin, canEdit, onSave, renderEditor }: { records: RecordRow[]; houseId: string; playerId?: string; admin: boolean; canEdit: boolean; onSave: () => unknown; renderEditor: (row: RecordRow) => ReactNode }) {
  const npcs = records.filter(r => r.kind === 'character' && !isFichaPersonagem(r.title, r.content)).map(r => ({ row: r, ...parseNpc(r.title, r.content) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const [aberto, setAberto] = useState<string | null>(null);
  return <section className="campaign-npc-hub">
    <div className="campaign-npc-head"><h2>Personagens da casa</h2><span className="campaign-npc-count" aria-label={`${npcs.length} personagens`}>{npcs.length} {npcs.length === 1 ? 'NPC' : "NPC's"}</span></div>
    {canEdit && <NpcForm houseId={houseId} playerId={playerId} admin={admin} onSave={onSave} />}
    {npcs.length === 0 ? <p className="campaign-empty">Nenhum personagem cadastrado.</p> : <ul className="campaign-npc-list">{npcs.map(n => <li key={n.row.id} className={aberto === n.row.id ? 'aberto' : ''}>
      <div className="campaign-npc-row">
        <span className="campaign-npc-photo">{n.foto ? <PrivateImage path={n.foto} caption={n.nome} /> : <UserRound size={28} aria-hidden="true" />}</span>
        <button type="button" className="campaign-npc-toggle" aria-expanded={aberto === n.row.id} onClick={() => setAberto(aberto === n.row.id ? null : n.row.id)}>
          <span className="campaign-npc-name"><strong>{n.nome}</strong>{n.cargo && <span>Cargo: {n.cargo}</span>}</span>
          <ChevronDown size={18} className="campaign-npc-chevron" aria-hidden="true" />
        </button>
      </div>
      {aberto === n.row.id && <div className="campaign-npc-detail">{n.descricao ? <CampaignContent content={n.row.content} /> : <p className="campaign-empty">Sem descrição.</p>}{canEdit && renderEditor(n.row)}</div>}
    </li>)}</ul>}
  </section>;
}

function NpcForm({ houseId, playerId, admin, onSave }: { houseId: string; playerId?: string; admin: boolean; onSave: () => unknown }) {
  const [nome, setNome] = useState(''), [cargo, setCargo] = useState(''), [descricao, setDescricao] = useState(''), [visibility, setVisibility] = useState<'house' | 'player' | 'gm'>(playerId ? 'player' : 'house'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [images, setImages] = useState<PendingImage[]>([]); const key = useRef<string | null>(null);
  return <details className="campaign-add"><summary>Adicionar personagem</summary><form className="campaign-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setMessage('Sessão expirada.'); setBusy(false); return; }
    key.current ??= crypto.randomUUID();
    const base = (cargo.trim() ? `Cargo: ${cargo.trim()}\n\n` : '') + descricao.trim();
    let content; try { content = await uploadImages(base, images.map(i => ({ ...i, caption: i.caption || nome })), key.current); } catch (err) { setMessage(err instanceof Error ? err.message : 'Falha na imagem.'); setBusy(false); return; }
    const { error } = await supabase.from('campaign_records').insert({ id: key.current, title: nome.trim(), content: content || nome.trim(), visibility, kind: 'character', house_id: houseId, player_id: visibility === 'player' ? (playerId ?? null) : null, created_by: user.id, updated_by: user.id });
    if (error && error.code !== '23505') setMessage(error.message); else { key.current = null; setNome(''); setCargo(''); setDescricao(''); setImages([]); setMessage('Personagem salvo.'); onSave(); }
    setBusy(false);
  }}><label>Nome<input required value={nome} onChange={e => setNome(e.target.value)} /></label><label>Cargo<input value={cargo} placeholder="Ex.: Mestre de armas" onChange={e => setCargo(e.target.value)} /></label><label>Descrição<textarea value={descricao} onChange={e => setDescricao(e.target.value)} /></label><label>Visibilidade<select value={visibility} onChange={e => setVisibility(e.target.value as 'house' | 'player' | 'gm')}><option value="house">Compartilhado da casa</option>{playerId && <option value="player">Privado do jogador</option>}{admin && <option value="gm">Segredo do mestre</option>}</select></label><ImagePicker images={images} onChange={setImages} disabled={busy} /><Button disabled={busy}>Salvar personagem</Button><p role="status">{message}</p></form></details>;
}
