/** Histórico de compatibilidade do antigo acesso Espião.
 * O terceiro perfil é exclusivamente editorial e nunca habilita batalhas.
 * Esta função permanece para consumidores legados, mas concede ZERO acesso.
 */
type Player={id:string;name:string;roster_house_id:string|null;active:boolean;require_password_change:boolean};
type Membership={player_id:string;house_id:string};
export function canUseSpecialBattleSandbox(
 _admin:boolean,_player:Player|null|undefined,_members:readonly Membership[],
):boolean{
 return false;
}
