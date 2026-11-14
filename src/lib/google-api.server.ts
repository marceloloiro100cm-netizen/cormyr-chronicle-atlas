import { createSign } from 'node:crypto';

// Acesso direto às APIs do Google (Drive e Docs), sem gateway de terceiros.
// Credenciais aceitas, em ordem de prioridade (somente variáveis de servidor):
//   1. GOOGLE_ACCESS_TOKEN: token fixo, útil em testes ou uso manual de curta duração.
//   2. GOOGLE_SERVICE_ACCOUNT_JSON: JSON completo de uma conta de serviço. As pastas
//      do Drive precisam ser compartilhadas com o e-mail da conta de serviço.
//   3. GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN:
//      atua como a conta Google do Narrador, mantendo o acesso atual às pastas.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents';

let cache: { token: string; expires: number } | null = null;

export function googleUrl(service: string, path: string): string {
  const host = service === 'google_docs' ? 'https://docs.googleapis.com' : 'https://www.googleapis.com';
  return host + path;
}

export function googleConfigured(): boolean {
  const env = process.env;
  return Boolean(
    env['GOOGLE_ACCESS_TOKEN'] ||
      env['GOOGLE_SERVICE_ACCOUNT_JSON'] ||
      (env['GOOGLE_OAUTH_CLIENT_ID'] && env['GOOGLE_OAUTH_CLIENT_SECRET'] && env['GOOGLE_OAUTH_REFRESH_TOKEN']),
  );
}

function serviceAccountAssertion(raw: string): string {
  const account = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!account.client_email || !account.private_key) throw new Error('Conta de serviço do Google incompleta.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  return `${unsigned}.${signature}`;
}

export async function googleAccessToken(): Promise<string> {
  const env = process.env;
  const fixed = env['GOOGLE_ACCESS_TOKEN'];
  if (fixed) return fixed;
  if (cache && cache.expires > Date.now() + 60_000) return cache.token;

  const serviceAccount = env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  const clientId = env['GOOGLE_OAUTH_CLIENT_ID'];
  const clientSecret = env['GOOGLE_OAUTH_CLIENT_SECRET'];
  const refreshToken = env['GOOGLE_OAUTH_REFRESH_TOKEN'];
  let body: URLSearchParams;
  if (serviceAccount) {
    body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountAssertion(serviceAccount),
    });
  } else if (clientId && clientSecret && refreshToken) {
    body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  } else {
    throw new Error('Credenciais do Google indisponíveis.');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`O Google recusou as credenciais (${response.status}).`);
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('O Google não devolveu um token de acesso.');
  cache = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cache.token;
}

export async function withGoogleAuth(headers: Headers): Promise<Headers> {
  headers.set('Authorization', `Bearer ${await googleAccessToken()}`);
  return headers;
}
