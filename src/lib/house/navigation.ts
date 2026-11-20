/** Navigation policy for the original House workspace.
 * History and local exports are read-only and available to each authorized House,
 * even when Firebase economy mutations and Google Drive synchronization are off.
 * Narrator-only panels remain outside the player menu.
 */
export function houseNavigationVisible(id:string,admin:boolean,firebase:boolean):boolean{
 if(['reconciliation','coverage','kingdom'].includes(id))return false;
 if(id==='rules')return admin&&firebase;
 return true;
}
