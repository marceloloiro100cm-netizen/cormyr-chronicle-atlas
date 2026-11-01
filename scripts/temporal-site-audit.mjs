/**
 * Hub Temporal Lote 22 — read-only static contract audit of all app runtime files.
 * This is source-level analysis, NOT proof that every UI branch behaves correctly.
 *
 * node scripts/temporal-site-audit.mjs --report
 * node scripts/temporal-site-audit.mjs --gate
 */
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const IS_RUNTIME=/\.(?:ts|tsx|js|jsx)$/;
const SOURCE_ROOTS=['src'];
const CANONICAL='src/lib/calendar/campaign-time.ts';
export const REQUIRED_SURFACES=Object.freeze({
 [CANONICAL]:['get_campaign_calendar',"CAMPAIGN_TIME_QUERY_KEY","useCampaignTime"],
 'src/components/calendar/realtime.ts':['temporalQueryKeysForInvalidation','campaign_calendar'],
 'src/lib/calendar/time-connections.ts':["prefix:'campaign-calendar'","prefix:'mail-page'","prefix:'house-time-impact'","prefix:'character-age-dashboard'"],
 'src/components/calendar/calendar.tsx':['useCampaignTime','useCampaignCalendarRealtime'],
 'src/components/calendar/narrator-calendar.tsx':['useCampaignTime','useCampaignCalendarRealtime','publish_campaign_time_change'],
 'src/components/calendar/narrator-character-ages.tsx':['useCampaignTime','currentYear'],
 'src/components/players/missivas-tab.tsx':['useCampaignTime','currentTime'],
 'src/components/house/hub.tsx':['useCampaignTime','calendarDrift'],
 'src/components/house/kingdom-dashboard.tsx':['useCampaignTime','calendarDrift'],
 'src/lib/house/calendar-consistency.ts':['calendarMonthIndex','requireCalendarAlignment'],
 'src/components/calendar/chronology.tsx':['p_year:year','p_month:month'],
 'src/lib/calendar/house-time-impact.ts':['monthFromHarptosDate','year*12+date.month'],
});
/**
 * Authorized on-demand server guards read the SAME official RPC.
 * They must not depend on the browser query cache when applying a purchase:
 * that would create a TOCTOU window between display and authoritative write.
 * Frozen call count: any new server reader requires explicit audit review.
 */
export const AUTHORIZED_SERVER_CLOCK_GUARDS=Object.freeze({
 'src/lib/house/house.functions.ts':{
  maxCalls:4,
  required:['createServerFn','requireSupabaseAuth','requireCalendarAlignment',
   'calendarMonthIndex','reconcileHouseCalendar'],
 },
});
const CRITICAL_QUERY_KEYS=[
 'campaign-calendar','calendar-events','calendar-schedule-events',
 'campaign-chronology','noble-house','house-realm-dashboard',
 'house-time-impact','temporal-consumer-dashboard',
 'temporal-release-preflight','character-age-dashboard',
 'campaign-panel','mail-page','mail-insights','mail-overview-grouped','reply-delivery',
];
const dateSources=[
 {code:'INDEPENDENT_CAMPAIGN_YEAR',regex:/\b(?:currentYear|campaignYear|officialYear|realmYear|currentCampaignYear)\s*=\s*(?:new Date\(\)\.getFullYear\(\)|(?:15|16)\d\d\b)/g},
 {code:'WALL_CLOCK_CAMPAIGN_DATE',regex:/\b(?:campaignDate|officialDate|currentCampaignDate)\s*=\s*(?:new Date\(|Date\.now\()/g},
];
function isRuntimeFile(path){
 return IS_RUNTIME.test(path)&&!/(?:^|\/)(?:test|__tests__|fixtures|generated)(?:\/|$)/.test(path)&&
  !/\.(?:test|spec)\.[jt]sx?$/.test(path);
}
function walk(dir,base,files){
 for(const name of readdirSync(dir)){
  const file=join(dir,name);
  const rel=relative(base,file).replaceAll('\\','/');
  if(statSync(file).isDirectory()){
   if(['node_modules','.git','.output','dist','build'].includes(name))continue;
   walk(file,base,files);
  }else if(isRuntimeFile(rel))files[rel]=readFileSync(file,'utf8');
 }
}
export function readRuntimeSources(root=ROOT){
 const files={};
 for(const path of SOURCE_ROOTS)walk(join(root,path),root,files);
 return files;
}
function matchLines(source,regex){
 return [...source.matchAll(regex)].map(m=>{
  const position=m.index??0;
  return source.slice(0,position).split('\n').length;
 });
}
export function auditTemporalSite(files){
 const errors=[],warnings=[],domains={};
 const keysSource=files['src/lib/calendar/time-connections.ts']??'';
 const parsedConnections=[...keysSource.matchAll(/prefix:'([^']+)'/g)].map(m=>m[1]);
 if(parsedConnections.length===0)errors.push({code:'MISSING_CONNECTION_MATRIX',path:'src/lib/calendar/time-connections.ts'});
 const unique=new Set(parsedConnections);
 if(unique.size!==parsedConnections.length)
  errors.push({code:'DUPLICATE_CONNECTION_PREFIX',path:'src/lib/calendar/time-connections.ts'});
 for(const key of CRITICAL_QUERY_KEYS)
  if(!unique.has(key))
   errors.push({code:'MISSING_REQUIRED_QUERY_PREFIX',path:'src/lib/calendar/time-connections.ts',key});
 for(const [path,markers] of Object.entries(REQUIRED_SURFACES)){
  const source=files[path];
  if(source===undefined){errors.push({code:'MISSING_CANONICAL_SURFACE',path});continue;}
  for(const marker of markers)
   if(!source.includes(marker))
    errors.push({code:'MISSING_SURFACE_INTEGRATION',path,marker});
 }
 for(const [path,source] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b))){
  const category=path.startsWith('src/components/calendar/')?'calendar-ui':
   path.startsWith('src/components/house/')?'house-ui':
   path.startsWith('src/components/players/')?'correspondence-ui':
   path.startsWith('src/lib/calendar/')?'calendar-lib':
   path.startsWith('src/lib/house/')?'house-lib':'other-runtime';
  domains[category]=(domains[category]??0)+1;
  if(path!==CANONICAL){
   const rpcLines=matchLines(source,/\.rpc\(\s*['"]get_campaign_calendar['"]/g);
   const guard=AUTHORIZED_SERVER_CLOCK_GUARDS[path];
   if(guard){
    for(const marker of guard.required)
     if(!source.includes(marker))
      errors.push({code:'MISSING_SERVER_CLOCK_GUARD',path,marker});
    if(rpcLines.length!==guard.maxCalls)
     errors.push({code:'SERVER_CLOCK_READS_CHANGED',path,
      expected:guard.maxCalls,actual:rpcLines.length});
   }else for(const line of rpcLines)
    errors.push({code:'SECOND_CANONICAL_CLOCK_FETCH',path,line});
  }
  for(const line of matchLines(source,/\.from\(\s*['"]campaign_calendar['"]/g))
   errors.push({code:'DIRECT_CALENDAR_TABLE_QUERY',path,line});
  for(const detection of dateSources)
   for(const line of matchLines(source,detection.regex))
    errors.push({code:detection.code,path,line});
  // Review list: these can be legitimate audit timestamps, history dates,
  // IDs, or help text. Never automatically relabel as game clock.
  if(/calendar|house|missiv|letter|noble|character/i.test(path)){
   for(const line of matchLines(source,/\bnew Date\(\)\.get(?:Month|Date|FullYear)\(\)/g))
    warnings.push({code:'REVIEW_WALL_CLOCK_USAGE',path,line});
   for(const line of matchLines(source,/\b(?:year|month|ano)\s*[:=]\s*15\d\d\b/g))
    warnings.push({code:'REVIEW_HARDCODED_YEAR',path,line});
  }
 }
 // The summary is a contract registry; it does NOT certify nonlisted screens.
 return {
  format_version:1,
  files_inspected:Object.keys(files).length,
  source_groups:domains,
  required_surfaces:Object.keys(REQUIRED_SURFACES).length,
  registered_invalidation_prefixes:parsedConnections.length,
  canonical_rpc:CANONICAL,
  approved_server_guards:Object.keys(AUTHORIZED_SERVER_CLOCK_GUARDS).length,
  errors,
  review_candidates:warnings,
  static_contract_ok:errors.length===0,
  all_site_behaviour_verified:false,
  database_accessed:false,
  production_release_authorized:false,
 };
}
export function runTemporalSiteAudit(argv,root=ROOT){
 if(argv.length!==1||!['--report','--gate'].includes(argv[0]))
  throw Error('Use apenas --report ou --gate');
 const report=auditTemporalSite(readRuntimeSources(root));
 return {report,exitCode:argv[0]==='--gate'&&!report.static_contract_ok?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=runTemporalSiteAudit(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(err){
  process.stderr.write('Auditoria de conexões temporais bloqueada: '+
   (err instanceof Error?err.message:String(err))+'\n');
  process.exitCode=2;
 }
}
