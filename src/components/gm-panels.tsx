import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type GmEvent = { id: number; kind: string; theme: string; title: string; hook: string; a: string; b: string; clue: string; scale?: string };
type GmAdventure = { id: string; title: string; season: string; status: string; summary: string; content: string };
type GmContent = { events: GmEvent[]; adventures: GmAdventure[] };

function useGmContent() {
  return useQuery({
    queryKey: ['gm-content'],
    queryFn: async (): Promise<GmContent> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/public/gm-content', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.status === 403) throw new Error('Este acervo é exclusivo do Narrador.');
      if (!res.ok) throw new Error('Não foi possível carregar o acervo do Narrador.');
      return res.json() as Promise<GmContent>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function GmEventos() {
  const { data, error, isPending } = useGmContent();
  const [kind, setKind] = useState('mundanos');
  const [theme, setTheme] = useState('');
  const [query, setQuery] = useState('');
  if (isPending) return <p role="status">Carregando os eventos do Narrador…</p>;
  if (error || !data) return <p role="alert">{error?.message ?? 'Falha ao carregar.'}</p>;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const themes = [...new Set(data.events.filter((e) => e.kind === kind).map((e) => e.theme))];
  const visible = data.events.filter((e) => e.kind === kind && (!theme || e.theme === theme) && (!query || norm([e.id, e.title, e.hook, e.theme].join(' ')).includes(norm(query))));
  return (
    <section>
      <h2>Eventos do Narrador</h2>
      <p className="text-muted-foreground">Acervo reservado: {data.events.length} eventos entre mundanos e místicos.</p>
      <div className="campaign-mail-filters">
        <label>Tipo<select value={kind} onChange={(e) => { setKind(e.target.value); setTheme(''); }}><option value="mundanos">Mundanos</option><option value="misticos">Místicos</option></select></label>
        <label>Tema<select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="">Todos os temas</option>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Buscar<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, número ou assunto…" /></label>
        <Button variant="outline" onClick={() => { setKind('mundanos'); setTheme(''); setQuery(''); }}>Limpar filtros</Button>
      </div>
      <p role="status" className="text-muted-foreground">{visible.length} eventos encontrados</p>
      {visible.map((e) => (
        <article className="campaign-record" key={`${e.kind}-${e.id}`}>
          <header><span className="campaign-eyebrow">{e.kind === 'misticos' ? 'MÍSTICO' : 'MUNDANO'} {String(e.id).padStart(3, '0')}</span><span className="text-sm text-muted-foreground">{e.scale || e.theme}</span></header>
          <h3>{e.title}</h3>
          <p>{e.hook}</p>
          <details><summary>Decisões e consequências</summary><dl className="ficha-info"><div><dt>Uma decisão</dt><dd>{e.a}</dd></div><div><dt>Outra decisão</dt><dd>{e.b}</dd></div><div><dt>O que pode mudar a conversa</dt><dd>{e.clue}</dd></div></dl></details>
        </article>
      ))}
    </section>
  );
}

export function GmAventuras() {
  const { data, error, isPending } = useGmContent();
  if (isPending) return <p role="status">Carregando as aventuras…</p>;
  if (error || !data) return <p role="alert">{error?.message ?? 'Falha ao carregar.'}</p>;
  return (
    <section>
      <h2>Aventuras</h2>
      <p className="text-muted-foreground">Arquivos de narração reservados ao Narrador.</p>
      {data.adventures.map((a) => (
        <article className="campaign-record" key={a.id}>
          <header><span className="campaign-eyebrow">{a.season}</span><span className="text-sm text-muted-foreground">{a.status}</span></header>
          <h3>{a.title}</h3>
          <p>{a.summary}</p>
          <details><summary>Ler a aventura completa</summary><div className="campaign-prose" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.content) }} /></details>
        </article>
      ))}
    </section>
  );
}
