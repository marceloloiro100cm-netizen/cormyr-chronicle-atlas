/** Diagnóstico temporário somente leitura do filtro Ashkar do Editor-Chefe.
 * Nenhum conteúdo, assunto, UID, nome de pessoa ou ID de carta é impresso.
 * Reutiliza o mesmo serviço autenticado do site e a mesma função mail_page.
 */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {listCurrentAccountAccess} from './operational-account-access.mjs';
import {createWorkspaceService} from '../../src/lib/firebase-workspace/service';

if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||process.env.FIRESTORE_EMULATOR_HOST)
 throw Error('audit_wrong_project');
const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},'editor-ashkar-readonly');
const db=getFirestore(app);
const auth=getAuth(app);
const roots=await db.collection('campaignWorkspaceImports').limit(7).get();
const found=roots.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&d.data()?.status==='complete'&&
 d.data()?.private===true&&d.data()?.sourceSnapshotId===d.id);
if(roots.size>6||found.length!==1)throw Error('audit_snapshot_ambiguous');
const snapshotId=found[0]!.id;
const accounts=await listCurrentAccountAccess(db,snapshotId);
const candidates=accounts.filter(a=>a.profile==='editor'&&a.active===true&&
 a.requirePasswordChange===false&&typeof a.userId==='string'&&a.memberHouseIds.length===0);
if(candidates.length!==1)throw Error('audit_editor_unavailable');
const candidate=candidates[0]!;
const user=await auth.getUser(candidate.userId);
if(user.uid!==candidate.userId||user.disabled)throw Error('audit_editor_auth_inactive');
process.env.CORMYR_FIREBASE_CLOUD_MAIL_ENABLED='true';
const scopedAuth={verifyIdToken:async()=>({uid:candidate.userId}),
 getUser:(uid:string)=>auth.getUser(uid)};
const service=createWorkspaceService({db,auth:scopedAuth,snapshotId,cacheImportedTables:true});
const filter=(f:Record<string,string>)=>({kind:'rpc',name:'mail_page',
 args:{p_filters:{text:'',number:'',kind:'',read:'',...f},p_page:0,p_size:20}});
// Always resolve the SAME id selected in the UI. In the real roster the
// display name may be "Casa Ashkar" and the id need not be the slug.
const roster=await service.execute('authorized-editor-filter-audit',{kind:'query',
 table:'campaign_houses',steps:[{op:'select',args:['id,name']}]});
if(!Array.isArray(roster))throw Error('audit_catalog_unavailable');
const ashkar=roster.filter(h=>typeof h?.name==='string'&&
 /ashkar/i.test(h.name));
if(ashkar.length!==1||typeof ashkar[0]?.id!=='string')
 throw Error('audit_ashkar_catalog_ambiguous');
const houseId=ashkar[0].id;
const items=[filter({}),filter({origin:houseId}),
 filter({house:houseId}),filter({origin:'none'})];
const responses=await service.execute('authorized-editor-filter-audit',{kind:'batch',items});
if(!Array.isArray(responses)||responses.length!==items.length||
 responses.some(r=>r?.ok!==true))throw Error('audit_query_failed');
const totals=responses.map(r=>r.result?.total);
if(totals.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('audit_count_invalid');
const [all,origin,related,narrator]=totals as number[];
if(related<origin||all<related)throw Error('audit_filter_inconsistent');
console.log('EDITOR_ASHKAR_AUDIT '+JSON.stringify({
 status:'ok',totalDeliveredVisible:all,originOnly:origin,
 houseInvolved:related,narratorOrigin:narrator,
 relatedButNotOrigin:related-origin,catalogIdIsSlug:houseId==='ashkar',countsOnly:true,
}));
