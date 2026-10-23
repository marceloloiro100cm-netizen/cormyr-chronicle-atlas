import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CampaignShell } from '@/components/campaign-shell';
import { oauthReturnPath } from '@/lib/oauth-return-path';

type AuthorizationDetails = {
  client?: { name?: string; redirect_uris?: string[] } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Confirmar sua identidade',
  email: 'Compartilhar seu endereço de e-mail',
  profile: 'Compartilhar seu perfil básico',
};

export const Route = createFileRoute('/.lovable/oauth/consent')({
  validateSearch: (search: Record<string, unknown>) => ({ authorization_id: typeof search['authorization_id'] === 'string' ? search['authorization_id'] : '' }),
  head: () => ({ meta: [{ title: 'Conectar aplicativo — Cormyr Chronicle' }, { name: 'description', content: 'Autorize um aplicativo externo a usar o Cormyr Chronicle com a sua conta.' }, { property: 'og:title', content: 'Conectar aplicativo — Cormyr Chronicle' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Consent,
  errorComponent: ({ error }) => (
    <CampaignShell><h1>Conexão com aplicativo</h1><p role="alert">Não foi possível carregar esta autorização: {error instanceof Error ? error.message : 'erro desconhecido'}.</p></CampaignShell>
  ),
});

function Consent() {
  const { authorization_id: authorizationId } = Route.useSearch();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authorizationId) { setMessage('Pedido de autorização inválido ou expirado.'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        const back = oauthReturnPath(`/.lovable/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
        navigate({ to: '/auth', search: { next: back } });
        return;
      }
      setEmail(data.user.email ?? '');
      const { data: result, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error) { setMessage('Não foi possível carregar o pedido de autorização: ' + error.message); return; }
      if (result && !('authorization_id' in result)) { window.location.assign(result.redirect_url); return; }
      setDetails(result as AuthorizationDetails);
    });
  }, [authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true); setMessage('');
    try {
      const call = approve
        ? supabase.auth.oauth.approveAuthorization(authorizationId)
        : supabase.auth.oauth.denyAuthorization(authorizationId);
      const { data, error } = await call;
      if (error) throw error;
      const redirect = data?.redirect_url;
      if (redirect) window.location.assign(redirect);
      else setMessage(approve ? 'Conexão autorizada. Pode voltar ao aplicativo.' : 'Conexão cancelada. Pode voltar ao aplicativo.');
    } catch (e) {
      setMessage('Falha ao concluir: ' + (e instanceof Error ? e.message : 'erro desconhecido'));
    } finally { setBusy(false); }
  }

  const clientName = details?.client?.name ?? 'Aplicativo externo';
  const scopes = (details?.scope ?? '').split(' ').filter(Boolean);

  return (
    <CampaignShell>
      <p className="campaign-eyebrow">CONEXÃO EXTERNA</p>
      <h1>Conectar {clientName} ao Cormyr Chronicle</h1>
      <section className="campaign-auth">
        {details ? (
          <>
            <p>Conectado como <strong>{email}</strong>.</p>
            <p>O {clientName} poderá usar as ferramentas deste site com a sua conta enquanto você estiver conectado.</p>
            {scopes.length > 0 && (
              <ul className="campaign-roster">
                {scopes.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? `Permissão adicional solicitada: ${s}`}</li>)}
              </ul>
            )}
            <p className="text-muted-foreground text-sm">Isso não ultrapassa as permissões e as regras de acesso já existentes no site.</p>
            <div className="campaign-actions">
              <Button disabled={busy} onClick={() => decide(true)}>{busy ? 'Aguarde…' : 'Autorizar conexão'}</Button>
              <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Cancelar conexão</Button>
            </div>
          </>
        ) : (
          <p role="status">{message || 'Carregando pedido de autorização…'}</p>
        )}
        {message && details && <p role="status">{message}</p>}
      </section>
    </CampaignShell>
  );
}
