import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}));
vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (fn: unknown) => fn,
}));

import {I18nProvider} from '@/lib/i18n/context';
import {useEffect} from 'react';
import {PlayersArea} from '@/components/players/players-workspace';
import {activateVisualPreview,deactivateVisualPreviewSoon} from '@/lib/visual-preview/activate';

// Fixture harness only: the official Firebase entry must never activate demo data.
function VisualPreviewHarness({profile,memberHouseIds,onSignOut}: {profile:'jogador'|'narrador'|'editor';memberHouseIds:string[];onSignOut:()=>void}) {
  activateVisualPreview(profile,memberHouseIds);
  useEffect(()=>()=>deactivateVisualPreviewSoon(),[]);
  return <PlayersArea onSignOut={onSignOut} hideBattle/>;
}
import {isVisualPreview} from '@/lib/visual-preview/state';
import {supabase} from '@/integrations/supabase/client';

beforeAll(() => {
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  const g = globalThis as unknown as Record<string, unknown>;
  g['ResizeObserver'] ??= Observer;
  g['IntersectionObserver'] ??= Observer;
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {value: {...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000999'}});
  }
});
afterEach(cleanup);

function mount(profile: 'jogador' | 'narrador' | 'editor', houses: string[] = []) {
  const qc = new QueryClient({defaultOptions: {queries: {retry: false, refetchInterval: false}}});
  const signOut = vi.fn();
  const view = render(<QueryClientProvider client={qc}><I18nProvider>
    <VisualPreviewHarness profile={profile} memberHouseIds={houses} onSignOut={signOut}/>
  </I18nProvider></QueryClientProvider>);
  return {...view, signOut};
}

describe('área interna Firebase com a interface original (prévia visual)', () => {
  it('jogador vê o Conselho original, sem módulo de batalha', async () => {
    const {unmount} = mount('jogador', ['ashkar']);
    expect(isVisualPreview()).toBe(true);
    expect(await screen.findByRole('heading', {name: 'Jogador · Casa Ashkar'})).toBeInTheDocument();
    for (const tab of ['Casa', 'Ficha', 'Galeria', 'Calendário', 'Documentos', 'Jornal'])
      expect(screen.getByRole('button', {name: new RegExp('^' + tab)})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /^Batalha/})).toBeNull();
    expect(await screen.findByText('Convocação ao Conselho de Suzail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: /^Ficha/}));
    expect(await screen.findByRole('heading', {name: 'Casa Ashkar'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Espionagem/}));
    expect(await screen.findAllByText(/Sombra das Cinzas/)).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', {name: /^Galeria/}));
    fireEvent.click(screen.getByRole('button', {name: /^Calendário/}));
    expect(await screen.findByText('Calendário de Harptos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /^Jornal/}));
    await waitFor(() => expect(screen.queryByRole('heading', {name: 'Calendário de Harptos'})).toBeNull());

    unmount();
    await waitFor(() => expect(isVisualPreview()).toBe(false));
  });

  it('Narrador navega pelo menu original e pela visão dos jogadores', async () => {
    mount('narrador');
    expect(await screen.findByRole('heading', {name: 'Conselho do mestre'})).toBeInTheDocument();
    for (const item of ['Conselho das casas', 'Missivas', 'Jornal', 'Hub Temporal', 'Dossiês de Espionagem', 'Eventos', 'Aventuras'])
      expect(screen.getByRole('button', {name: new RegExp('^' + item)})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Módulo de batalha'})).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: /^Missivas/}));
    expect(await screen.findByText('Central de missivas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /^Hub Temporal/}));
    expect(await screen.findAllByText('Calendário de Harptos')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', {name: /^Dossiês de Espionagem/}));
    fireEvent.click(screen.getByRole('button', {name: /^Conselho das casas/}));

    fireEvent.change(screen.getByRole('combobox', {name: 'Acessar como jogador'}), {target: {value: '00000000-0000-4000-8000-000000000fa2'}});
    expect(await screen.findByText(/Representação administrativa/)).toBeInTheDocument();
  });

  it('Editor-Chefe abre a redação original do jornal', async () => {
    const {signOut} = mount('editor');
    await waitFor(() => expect(screen.getAllByText(/A Folha Sem Selo/).length).toBeGreaterThan(0));
    const exit = screen.queryAllByRole('button', {name: /^Sair/})[0];
    if (exit) {
      fireEvent.click(exit);
      await waitFor(() => expect(signOut).toHaveBeenCalled());
    }
  });

  it('a prévia nunca alcança o Supabase legado e recusa escritas', async () => {
    mount('jogador', ['goldfin']);
    const write = await supabase.from('campaign_records').insert({} as never);
    expect(write.error?.message).toMatch(/Prévia visual/);
    const read = await supabase.from('campaign_houses').select('*');
    expect((read.data ?? []).length).toBe(8);
  });

  it('a rota Firebase carrega a área interna só após a sessão validada', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/routes/firebase-access.tsx'), 'utf8');
    expect(route).toContain("lazy(()=>import('@/components/firebase/FirebaseCampaignWorkspace'))");
    expect(route).toContain('const council=view?<Suspense');
    expect(route).toContain('if(council)return council;');
    // Uma só tela de login (/auth): a rota interna nunca mostra outro formulário.
    expect(route).not.toContain('<h1>Portões de Cormyr</h1>');
    expect(route).not.toContain('signInWithPassword');
    expect(route).toContain("navigate({to:'/auth',search:{next:'/'},replace:true})");
    expect(route).toContain('<CouncilOpening publicTime>');
  });
});
