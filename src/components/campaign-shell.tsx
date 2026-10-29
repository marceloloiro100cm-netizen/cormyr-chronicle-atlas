import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { LanguageSwitcher } from './language-switcher';
import { useTranslation } from '@/lib/i18n/context';

export function CampaignShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return <div className="campaign-theme min-h-screen bg-background text-foreground">
    <header className="campaign-top">
      <a href="/cormyr/index.html" className="campaign-brand"><img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" /><span>Cormyr <em>Chronicle</em><small>Crônicas do Reino · 1522 CV</small></span></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
        <nav><a href="/cormyr/index.html">{t('nav.kingdomAndRegions')}</a><Link to="/jogadores">{t('nav.playerCouncil')}</Link></nav>
        <LanguageSwitcher />
      </div>
    </header>
    <main className="campaign-main">{children}</main>
  </div>;
}