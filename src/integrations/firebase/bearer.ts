// Extrai o ID token de um cabeçalho Authorization. Retorna null se o formato for inválido.
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? '');
  const token = match?.[1];
  if (!token || token.split('.').length !== 3) return null;
  return token;
}
