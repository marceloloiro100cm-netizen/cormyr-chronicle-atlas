/** Navigation policy for the original House workspace.
 * "Histórico e documentos" e "Regras e Tabelas" ficam ocultos do menu da Casa
 * (decisão do proprietário, 20/11/2026); o código das seções continua no hub,
 * pronto para voltar, e as exportações seguem disponíveis por outros caminhos.
 * Narrator-only panels remain outside the player menu.
 */
export const HIDDEN_HOUSE_SECTIONS:readonly string[]=['reconciliation','coverage','kingdom','history','rules'];
export function houseNavigationVisible(id:string,_admin:boolean,_firebase:boolean):boolean{
 return !HIDDEN_HOUSE_SECTIONS.includes(id);
}
