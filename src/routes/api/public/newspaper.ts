import {createFileRoute} from '@tanstack/react-router';
import {listPublicNewspapers,getPublicNewspaper,recordPublicNewspaperRead,publicStaff,
  PublicNewspaperError} from '@/lib/newspaper/firebase-public-newspaper.server';
import {readNewspaperStaffOverlay} from '@/lib/newspaper/firebase-newspaper-staff.server';
import {crossOriginRejected} from '@/lib/server/request-origin';

/**
 * A Folha Sem Selo para o site aberto (sem conta): lista das edições
 * publicadas, leitura de uma edição, equipe da Redação e contagem de
 * leituras para o Editor-Chefe. Anônimo e somente do Firebase; usa a mesma
 * lista aprovada dos leitores autenticados e nunca devolve rascunhos,
 * encomendas, missivas, dados de Casas ou caminhos privados.
 */
const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};
const fail=(status:number,code:string)=>Response.json({error:code},{status,headers:HEADERS});

async function firestore(){
  const [{initializeApp,getApps,applicationDefault},{getFirestore}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/firestore'),
  ]);
  const name='cormyr-public-newspaper';
  const app=getApps().find(item=>item.name===name)??initializeApp({
    credential:applicationDefault(),projectId:'cormyr',
  },name);
  return getFirestore(app);
}
function config(){
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const ok=process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']==='true'&&
    /^[a-f0-9]{64}$/.test(snapshotId)&&!process.env['FIRESTORE_EMULATOR_HOST']&&
    !process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  return ok?snapshotId:null;
}
function failure(error:unknown){
  if(error instanceof PublicNewspaperError)
    return fail(error.status,error.status>=500?'newspaper_unavailable':error.code);
  // Sem detalhes de IAM, caminhos privados ou hash do snapshot.
  return fail(503,'newspaper_unavailable');
}

async function handleGet(request:Request):Promise<Response>{
  const snapshotId=config();
  if(!snapshotId)return fail(503,'newspaper_unavailable');
  const url=new URL(request.url);
  const params=[...url.searchParams.keys()];
  // Fast, immutable issued-editions list for the Editor-Chefe archive.
  // It is the SAME public allowlist; avoid waiting for the independent
  // newsroom staff projection before displaying published issues.
  if(params.some(k=>!['edicao','arquivo'].includes(k))||
     (url.searchParams.has('arquivo')&&
      (url.searchParams.get('arquivo')!=='edicoes'||url.searchParams.has('edicao')))||
     params.length>1)return fail(400,'invalid_request');
  try{
    const db=await firestore();
    const id=url.searchParams.get('edicao');
    if(id!==null)return Response.json(await getPublicNewspaper(db,snapshotId,id),{status:200,headers:HEADERS});
    if(url.searchParams.get('arquivo')==='edicoes')
      return Response.json(await listPublicNewspapers(db,snapshotId,{releaseDue:false}),{status:200,headers:HEADERS});
    const [list,overlay]=await Promise.all([
      listPublicNewspapers(db,snapshotId),
      readNewspaperStaffOverlay(db,snapshotId).catch(()=>null),
    ]);
    let staffRows=overlay;
    if(!staffRows){
      const {readWorkspaceTable}=await import('../../../../scripts/firebase/workspace-import.mjs');
      staffRows=await readWorkspaceTable(db,snapshotId,'campaign_newspaper_staff').catch(()=>[]) as Record<string,unknown>[];
    }
    return Response.json({...list,staff:publicStaff(staffRows as Record<string,unknown>[])},
      {status:200,headers:HEADERS});
  }catch(error){return failure(error);}
}

async function handlePost(request:Request):Promise<Response>{
  const snapshotId=config();
  if(!snapshotId)return fail(503,'newspaper_unavailable');
  if(new URL(request.url).search||request.headers.has('cookie')||crossOriginRejected(request))
    return fail(403,'access_denied');
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return fail(415,'json_required');
  const text=await request.text();
  if(text.length>600)return fail(413,'body_too_large');
  let body:unknown;
  try{body=JSON.parse(text);}catch{return fail(400,'invalid_json');}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'invalid_json');
  const input=body as Record<string,unknown>;
  try{
    const result=await recordPublicNewspaperRead(await firestore(),snapshotId,
      input['editionId'],input['visitor']);
    return Response.json(result,{status:200,headers:HEADERS});
  }catch(error){return failure(error);}
}

export const Route=createFileRoute('/api/public/newspaper')({
  server:{handlers:{
    GET:async({request})=>handleGet(request),
    POST:async({request})=>handlePost(request),
  }},
});
