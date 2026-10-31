/**
 * Hub Temporal / Lote 30. Offline, read-only, fail-closed regression gate.
 * It does not access user accounts, GitHub secrets or Supabase, and cannot
 * approve a merge, migration, or production deploy.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const ACCESS_CRITICAL_FILES=Object.freeze({
 root:'src/routes/__root.tsx',
 sessions:'src/lib/auth/session-boundary.ts',
 permissions:'src/lib/auth/campaign-access-scope.ts',
 council:'src/routes/_authenticated/jogadores.tsx',
 panel:'src/components/players/panel-data.ts',
 houses:'src/lib/house/house.functions.ts',
 commit:'drizzle/migrations/0039_house_commander_transaction.sql',
 workflow:'.github/workflows/validate.yml',
});
export function readAccessCriticalFiles(root=ROOT){
 return Object.fromEntries(Object.entries(ACCESS_CRITICAL_FILES).map(([key,path])=>
  [key,readFileSync(resolve(root,path),'utf8')]));
}
const REQUIREMENTS=Object.freeze([
 ['root','decideSessionBoundary(knownUserId.current,event,session?.user?.id)'],
 ['root','clearSessionQueryCache(queryClient)'],
 ['root','<Outlet key={sessionEpoch} />'],
 ['sessions','cache.clear();'],
 ['sessions','clearRepresentationQueryCache'],
 ['permissions',"CAMPAIGN_ACCESS_SCOPE_POLL_MS=15_000"],
 ['permissions',"rpc('is_campaign_admin')"],
 ['permissions',"from('house_memberships')"],
 ['permissions','assertUnchangedAccessScope'],
 ['permissions','fingerprint'],
 ['council','refetchInterval:CAMPAIGN_ACCESS_SCOPE_POLL_MS'],
 ['council',"refetchOnWindowFocus:'always'"],
 ['council',"refetchOnReconnect:'always'"],
 ['council','clearRevokedAccessCache(qc)'],
 ['council','approved!==scope.data.fingerprint'],
 ['council','<PlayersWorkspace key={approved}'],
 ['panel','const before=await loadCampaignAccessScope()'],
 ['panel','const after=await loadCampaignAccessScope()'],
 ['panel','assertUnchangedAccessScope(before,after)'],
 ['houses','const [finalRole,finalMembership]'],
 ['houses','if(!finalRole.data&&!finalMembership.data)'],
 ['houses','const [adminNow,memberNow]'],
 ['houses','Histórico não autorizado após atualização dos vínculos.'],
 ['commit','AND m.can_edit AND p.user_id=p_actor AND p.active'],
 ['commit','pg_advisory_xact_lock'],
 ['commit','FOR UPDATE'],
 ['commit','coalesce(current_row.version,0)<>p_version'],
 ['workflow','scripts/test-temporal-membership-revocation.sql'],
 ['workflow','scripts/test-temporal-inflight-revocation.sql'],
 ['workflow','scripts/test-temporal-session-isolation.sql'],
] );
export const REQUIRED_TESTS=Object.freeze([
 'src/test/hub-temporal-access-revocation-lote27.test.ts',
 'src/test/house-inflight-revocation-lote28.test.ts',
 'src/test/hub-temporal-late-response-lote29.test.ts',
 'scripts/test-temporal-membership-revocation.sql',
 'scripts/test-temporal-inflight-revocation.sql',
 'scripts/test-temporal-session-isolation.sql',
]);
export function auditTemporalAccess(files,exists){
 const errors=[];
 for(const [file,marker] of REQUIREMENTS){
  if(!files[file]?.includes(marker))errors.push({code:'MISSING_AUTHORIZATION_GUARD',file,marker});
 }
 for(const file of REQUIRED_TESTS){
  if(!exists(file))errors.push({code:'MISSING_REGRESSION_TEST',path:file});
 }
 const h=files.houses??'';
 const initial=h.indexOf("export const houseOperation=");
 const final=h.indexOf('const [finalRole,finalMembership]',initial);
 const commit=h.indexOf("db.rpc('commit_noble_house_operation'",initial);
 if(initial<0||final<=initial||commit<=final)
  errors.push({code:'WRITE_AUTHORIZATION_ORDER_INVALID'});
 const panel=files.panel??'';
 const begin=panel.indexOf('const before=await loadCampaignAccessScope()');
 const finish=panel.indexOf('const after=await loadCampaignAccessScope()');
 const gate=panel.indexOf('assertUnchangedAccessScope(before,after)',finish);
 const ret=panel.indexOf('return {user,catalog',gate);
 if(begin<0||finish<=begin||gate<=finish||ret<=gate)
  errors.push({code:'PRIVATE_READ_GUARD_ORDER_INVALID'});
 const council=files.council??'';
 if(council.indexOf('if(scope.isError)')>=council.indexOf('<PlayersWorkspace key={approved}'))
  errors.push({code:'COUNCIL_NOT_FAIL_CLOSED'});
 return {
  schema_version:1,
  inspected_files:Object.keys(ACCESS_CRITICAL_FILES).length,
  guard_checks:REQUIREMENTS.length,
  regression_tests:REQUIRED_TESTS.length,
  errors,
  static_contract_ok:errors.length===0,
  real_database_tested:false,
  real_browser_sessions_tested:false,
  execute_migrations:false,
  authorize_merge:false,
  production_release_authorized:false,
  go_no_go:'NO_GO',
 };
}
export function runAudit(arg,root=ROOT){
 if(!['--gate','--report'].includes(arg))throw Error('Use --report ou --gate');
 const files=readAccessCriticalFiles(root);
 const report=auditTemporalAccess(files,p=>{try{return readFileSync(resolve(root,p)).length>0}catch{return false}});
 return {report,exitCode:arg==='--gate'&&!report.static_contract_ok?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('Informe um único modo --report ou --gate');
  const {report,exitCode}=runAudit(process.argv[2]);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(e){
  process.stderr.write('Lote 30 — auditoria bloqueada: '+(e instanceof Error?e.message:String(e))+'\n');
  process.exitCode=2;
 }
}
