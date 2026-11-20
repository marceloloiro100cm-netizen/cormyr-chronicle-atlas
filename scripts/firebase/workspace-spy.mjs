import {buildSpyAgentsPlan} from './stage-spy-emulator.mjs';
import {houseManagement,recruitmentOptions} from './spy-agents-core.mjs';
import {houseTimeline,counterintelligence,narratorOperations,incidentHistory} from './spy-missions-core.mjs';
import {readDossiers,adminPending} from './spy-intel-core.mjs';
import {readSpyOverlay,projectSpyOverlay} from './workspace-spy-overlay.mjs';
export async function readWorkspaceSpy({scope,name,args,rows,snapshotId,sheet,db}){
 if(scope.profile==='editor')throw Error('spy_access_denied');
 const h=args.p_house??null,admin=scope.profile==='narrador';
 if(!admin&&(!h||!scope.memberHouseIds.includes(h)))throw Error('spy_access_denied');
 const imported=await loadImportedSpyData(rows,snapshotId);
 const d=process.env.CORMYR_FIREBASE_SPY_ENABLED==='true'
  ?projectSpyOverlay(imported,await readSpyOverlay(db,snapshotId)):imported;
 const actor={uid:scope.uid,role:scope.profile,memberHouseIds:new Set(scope.memberHouseIds),editHouseIds:new Set(scope.editHouseIds)};
 const s=h?await sheet(h):null;
 const base={actor,houseId:h,assets:d.assets,allAssets:d.assets,operations:d.operations,segments:d.segments,
  history:d.history,upgrades:d.upgrades,locations:d.locations,sheet:s,catalog:d.catalog};
 if(name==='spy_house_management')return houseManagement({...base,catalog:d.portraits});
 if(name==='spy_recruitment_options')return recruitmentOptions({...base,catalog:d.portraits});
 if(name==='spy_house_mission_timeline')return houseTimeline({...base,timelines:d.timeline});
 if(name==='spy_house_counterintelligence')return counterintelligence(base);
 if(name==='spy_intelligence_read')return readDossiers({...base,dossiers:d.dossiers,findings:d.findings,events:d.intelEvents,audit:d.adminAudit});
 if(name==='spy_narrator_operations_dashboard'&&admin)return narratorOperations({...base,timelines:d.timeline,decisions:d.decisions,awards:d.awards});
 if(name==='spy_narrator_incident_history'&&admin)return incidentHistory(base);
 if(name==='spy_intelligence_admin_pending'&&admin)return adminPending({actor,awards:d.awards,dossiers:d.dossiers});
 if(name==='spy_public_noble_targets')return d.catalog.map(c=>({id:c.id,name:c.name,region:c.region}));
 throw Error('spy_operation_not_implemented');
}

/** Servidor recebe a projeção completa, nunca o navegador. */
export async function loadImportedSpyData(rows,snapshotId){
 const names=['spy_assets','spy_agent_history','spy_agent_upgrades','spy_agent_removals','spy_portrait_catalog',
 'spy_locations','spy_operations','spy_operation_segments','spy_operation_events','house_catalog','spy_noble_house_stats',
 'spy_mission_decisions','spy_mission_timeline','spy_intelligence_dossiers','spy_intelligence_findings',
 'spy_intelligence_mission_awards','spy_intelligence_events','spy_intelligence_admin_audit'];
 const tables=await Promise.all(names.map(async n=>{
  const data=await rows(n);
  return {table:'public.'+n,columns:Object.keys(data[0]??{}),rows:data.map(r=>Object.fromEntries(Object.entries(r)
   .map(([k,v])=>[k,v===null?null:typeof v==='string'?v:typeof v==='boolean'?v?'t':'f':JSON.stringify(v)])))};
 }));
 const plan=buildSpyAgentsPlan(tables,snapshotId);
 if(!plan.summary.planValid)throw Error('spy_import_invalid');
 const imported=Object.fromEntries(Object.entries(plan.docs).map(([k,v])=>[k,v.map(x=>x.payload)]));
 return imported;
}
