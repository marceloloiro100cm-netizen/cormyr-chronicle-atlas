/** Pilot access for the special Espião identity only.
 * Not a grant of narrator permissions or access to any official military sheet.
 * The player and membership come from the authenticated, RLS-checked panel.
 */
type Player={id:string;name:string;roster_house_id:string|null;active:boolean;require_password_change:boolean};
type Membership={player_id:string;house_id:string};
export function canUseSpecialBattleSandbox(
 admin:boolean,player:Player|null|undefined,members:readonly Membership[],
):boolean{
 if(admin||!player||!player.active||player.require_password_change)return false;
 if(player.name.trim().toLocaleLowerCase('pt-BR')!=='leonardo'||player.roster_house_id!=='espiao')return false;
 return members.some(member=>member.player_id===player.id&&member.house_id==='espiao');
}
