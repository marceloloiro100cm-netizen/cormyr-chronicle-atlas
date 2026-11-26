/**
 * Independent read-only account inventory rollout. Mutating account actions
 * remain behind the original explicit WRITE flag until live role E2E passes.
 */
export type FirebaseAccountAction='status'|'list'|'submit'|'completePassword'|'googleStatus'|'prepareGoogleLink'|'unlinkGoogle';
export function firebaseAccountActionEnabled(
 action:FirebaseAccountAction,env:Record<string,string|undefined>,
):boolean{
 if(env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true')return false;
 const write=env['CORMYR_FIREBASE_ACCOUNTS_ENABLED']==='true';
 if(write)return true;
 return env['CORMYR_FIREBASE_ACCOUNTS_READ_ENABLED']==='true'&&
  (action==='status'||action==='list'||action==='googleStatus');
}
