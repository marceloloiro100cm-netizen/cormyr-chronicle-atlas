/** Distinguishes accepted Firebase credentials from permission/readiness. */
export function firebasePilotLoginFailure(authenticatedByFirebase:boolean):string{
  if(authenticatedByFirebase)
    return 'Sua senha foi aceita pelo Firebase, mas o acesso ao Atlas está indisponível ou seu perfil ainda não foi autorizado. Nenhuma ação de jogo foi executada.';
  return 'Não foi possível autenticar com o Firebase. Confira seu e-mail e senha ou use Recuperar senha.';
}
