/**
 * Prévia visual da área interna (Conselho) após o login Firebase.
 *
 * A interface original da segunda temporada foi preservada nos componentes
 * legados, que leem dados pelo cliente Supabase e por server functions. Enquanto
 * os conectores Firebase não forem ligados, a área interna usa este estado para
 * trocar essas leituras por dados de demonstração locais. Nada aqui concede
 * permissão: a prévia é somente visual e nunca toca o banco real.
 *
 * Este módulo é propositalmente leve (sem imports) porque é lido pelo
 * cliente Supabase em toda propriedade acessada.
 */
export type VisualPreviewProfile = 'jogador' | 'narrador' | 'editor';

let activeClient: object | null = null;
let activeProfile: VisualPreviewProfile | null = null;

export function isVisualPreview(): boolean {
  return activeClient !== null;
}

export function visualPreviewProfile(): VisualPreviewProfile | null {
  return activeProfile;
}

/** Cliente simulado em uso, ou null quando a prévia está desligada. */
export function visualPreviewSupabase(): object | null {
  return activeClient;
}

export function setVisualPreviewClient(client: object | null, profile: VisualPreviewProfile | null) {
  activeClient = client;
  activeProfile = client ? profile : null;
}

/** Mensagem única para toda ação que ainda depende de um conector. */
export const VISUAL_PREVIEW_PENDING =
  'Prévia visual: esta ação ainda não está conectada ao Firebase.' as const;
