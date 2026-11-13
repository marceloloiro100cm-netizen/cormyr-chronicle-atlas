/**
 * A lossless, aggregate-only inventory of the verified private PostgreSQL
 * backup. This does not grant any rights or report a fictitious completion %.
 * Raw archive != usable, authorized Firestore data model.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const TYPED=new Set([
  'public.campaign_houses','public.campaign_players',
  'public.campaign_access_profiles','public.house_memberships',
  'public.user_roles','public.campaign_letters','public.campaign_calendar',
]);
const TEMPORAL_PRIVATE=new Set([
  'public.campaign_calendar_audit','public.campaign_time_operations',
  'public.campaign_temporal_consumers','public.campaign_temporal_deliveries',
  'public.campaign_temporal_delivery_resolutions',
  'public.campaign_temporal_effect_checkpoints',
]);
const AUTH=new Set(['auth.users','auth.identities']);
const EXPECTED=new Set([...TYPED,...TEMPORAL_PRIVATE,...AUTH]);

const BY_DOMAIN=[
  ['authentication',/^(auth\.|public\.user_roles$|public\.campaign_access_profiles$)/],
  ['houses-and-players',/^(public\.(noble_|house_|campaign_houses$|campaign_players$))/],
  ['correspondence',/^(public\.(campaign_letters$|letter_|mail_))/],
  ['calendar-and-temporal',/^(public\.(campaign_calendar|campaign_time_|campaign_temporal_))/],
  ['newspaper',/^(public\.(campaign_newspaper|newspaper_))/],
  ['espionage',/^(public\.(spy_|espionage_|campaign_spy_))/],
  ['battle-and-units',/^(public\.(battle_|military_|army_|unit_))/],
  ['storage-and-media',/^(storage\.|public\.(campaign_images|gallery_|media_|image_))/],
  ['other',/./],
];

export function classifyTable(name){
  return BY_DOMAIN.find(([,pattern])=>pattern.test(name))?.[0]||'other';
}

export function summarizeMigrationCoverage(tables){
  if(!Array.isArray(tables))throw Error('Invalid verified normalized table list');
  const seen=new Set();
  const summary={
    scope:'verified-private-postgres-backup-only',
    sourceTables:tables.length,sourceRows:0,
    publicTables:0,publicRows:0,
    otherSchemaTables:0,otherSchemaRows:0,
    sourceSchemaRequiredMissing:[],
    typedReadOnlyTables:0,typedReadOnlyRows:0,
    temporalPrivateStagingTables:0,temporalPrivateStagingRows:0,
    authPreparationTables:0,authPreparationRows:0,
    notYetFunctionallyModeledPublicTables:0,
    notYetFunctionallyModeledPublicRows:0,
    byDomain:{},
    sourceLiveReconciled:false,cloudWrites:0,
    allFunctionsReimplemented:false,
    readyForCutover:false,
  };
  for(const entry of tables){
    const name=entry?.table;
    if(typeof name!=='string'||seen.has(name)||!Array.isArray(entry.rows))
      throw Error('Invalid or duplicated verified table in audit');
    seen.add(name);
    const rows=entry.rows.length;
    const group=classifyTable(name);
    summary.sourceRows+=rows;
    if(!summary.byDomain[group])summary.byDomain[group]={tables:0,rows:0};
    summary.byDomain[group].tables++;
    summary.byDomain[group].rows+=rows;
    if(name.startsWith('public.')) {
      summary.publicTables++;summary.publicRows+=rows;
      if(TYPED.has(name)){
        summary.typedReadOnlyTables++;summary.typedReadOnlyRows+=rows;
      }else if(TEMPORAL_PRIVATE.has(name)){
        summary.temporalPrivateStagingTables++;
        summary.temporalPrivateStagingRows+=rows;
      }else{
        summary.notYetFunctionallyModeledPublicTables++;
        summary.notYetFunctionallyModeledPublicRows+=rows;
      }
    }else{
      summary.otherSchemaTables++;summary.otherSchemaRows+=rows;
      if(AUTH.has(name)){
        summary.authPreparationTables++;
        summary.authPreparationRows+=rows;
      }
    }
  }
  summary.sourceSchemaRequiredMissing=[...EXPECTED].filter(t=>!seen.has(t)).sort();
  return summary;
}

export async function auditMigrationCoverage(normalized){
  const {tables}=await loadVerifiedPrivateTables(normalized);
  return summarizeMigrationCoverage(tables);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3){
    console.error('Usage: node scripts/firebase/audit-migration-coverage.mjs PRIVATE_NORMALIZED_DIR');
    process.exitCode=2;
  }else{
    auditMigrationCoverage(process.argv[2])
      .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
      .catch(()=>{
        console.error('Migration coverage audit failed. No private row data printed.');
        process.exitCode=1;
      });
  }
}
