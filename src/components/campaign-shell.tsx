import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

export function CampaignShell({ children }: { children: ReactNode }) {
  return <div className="campaign-theme min-h-screen bg-background text-foreground">
    <header className="campaign-top"><a href="/cormyr/index.html" className="campaign-brand"><img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" /><span>Cormyr <em>Chronicle</em><small>Crônicas do Reino · 1522 CV</small></span></a><div className="flex items-center gap-4"><div className="flex items-center gap-2 text-lg"><button type="button" title="English" className="hover:opacity-80 transition-opacity">🇬🇧</button><button type="button" title="Español" className="hover:opacity-80 transition-opacity">🇪🇸</button><button type="button" title="Deutsch" className="hover:opacity-80 transition-opacity">🇩🇪</button></div><nav><a href="/cormyr/index.html">Acervo do reino</a><Link to="/jogadores">Área dos jogadores</Link></nav></div></header>
    <main className="campaign-main">{children}</main>
  </div>;
}