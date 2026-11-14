import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import {
  firebaseHomologationAuth, firebaseHomologationConfigured,
  verifyFirebaseHomologationToken,
} from '@/integrations/auth/firebase-homologation';
import { loginErrorMessage } from '@/lib/auth/season-houses';

export const Route = createFileRoute('/firebase-homolog')({
  component: FirebaseHomolog,
  head: () => ({ meta: [{ title: 'Homologação de acesso Firebase — Cormyr' }] }),
});

function FirebaseHomolog() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');
  const configured = firebaseHomologationConfigured();

  useEffect(() => {
    let active = true;
    const auth = firebaseHomologationAuth();
    if (auth) {
      void auth.getToken().then(async token => {
        if (!active || !token) return;
        const result = await verifyFirebaseHomologationToken(token);
        if (active) {
          setVerified(result === 'verified');
          if (result === 'denied') auth.signOut();
        }
      });
    }
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const auth = firebaseHomologationAuth();
    if (!auth) return;
    setBusy(true);
    setMessage('');
    try {
      const session = await auth.signInWithPassword(email, password);
      const result = await verifyFirebaseHomologationToken(session.idToken);
      if (result !== 'verified') {
        auth.signOut();
        setMessage(result === 'denied'
          ? 'Token recusado pelo servidor Firebase.'
          : 'Verificação indisponível: confira a configuração do servidor de homologação.');
        return;
      }
      setVerified(true);
      setPassword('');
    } catch (error) {
      setMessage(loginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    firebaseHomologationAuth()?.signOut();
    setVerified(false);
    setEmail('');
    setPassword('');
    setMessage('');
  }

  return <main className="mx-auto max-w-lg p-8">
    <h1 className="text-2xl font-bold">Homologação Firebase</h1>
    <p className="mt-3 text-sm">
      Teste isolado de autenticação. Esta página não libera acesso a Casas, missivas,
      narrador ou qualquer módulo da campanha.
    </p>
    {!configured && <p role="status" className="mt-6">
      A autenticação Firebase de homologação não está habilitada neste ambiente.
    </p>}
    {configured && verified && <section className="mt-6">
      <p role="status">Login Firebase confirmado e token validado pelo servidor.</p>
      <button type="button" className="mt-4 rounded border px-4 py-2" onClick={signOut}>
        Encerrar sessão de teste
      </button>
    </section>}
    {configured && !verified && <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">E-mail
        <input className="mt-1 block w-full rounded border p-2" type="email" required
          autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/>
      </label>
      <label className="block">Senha
        <input className="mt-1 block w-full rounded border p-2" type="password" required
          autoComplete="current-password" value={password}
          onChange={e => setPassword(e.target.value)}/>
      </label>
      <button type="submit" disabled={busy} className="rounded border px-4 py-2">
        {busy ? 'Verificando…' : 'Testar login Firebase'}
      </button>
    </form>}
    {message && <p role="alert" className="mt-4">{message}</p>}
    <p className="mt-8 text-sm"><a className="underline" href="/auth">
      Voltar ao acesso normal pelo Supabase
    </a></p>
  </main>;
}
