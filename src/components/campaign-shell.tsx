import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

export function CampaignShell({ children }: { children: ReactNode }) {
  return <div className="campaign-theme min-h-screen bg-background text-foreground">
    <header className="campaign-top"><a href="/cormyr/index.html" className="campaign-brand"><img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" /><span>Cormyr <em>Chronicle</em><small>Crônicas do Reino · 1522 CV</small></span></a><nav><a href="/cormyr/index.html">Acervo do reino</a><Link to="/jogadores">Área dos jogadores</Link></nav></header>
    <main className="campaign-main">{children}</main>
  </div>;
}