// Drive -> Firebase House galleries. Source bytes and IDs stay off GitHub.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const mode=process.argv[2], FOLDER='application/vnd.google-apps.folder';
const mimeTypes=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const max=20*1024*1024,work='.tmp-house-gallery',bucketName='cormyr-migration-homolog-477785088395';
const norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={yallander:'yellander',greatgaung:'greatgaunt',greenhorn:'greenhorns',aunkpear:'aunkspear',moutwyrm:'mountwyrm',huntininghorn:'huntinghorn',roringhorn:'roaringhorn',ridighound:'ridinghound'};
const canonical=n=>aliases[norm(n.replace(/^Casa\s+/i,''))]||norm(n.replace(/^Casa\s+/i,''));
const digest=b=>createHash('sha256').update(b).digest('hex');
const safeId=v=>/^[A-Za-z0-9_-]{10,256}$/.test(v);
const title=s=>String(s).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);
const signature=(b,t)=>t==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
 t==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:
 t==='image/webp'?b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP':
 t==='image/gif'?['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()):false;
async function catalog(){
 const raw=await readFile('public/cormyr/data.js','utf8');
 const regions=JSON.parse(raw.slice(raw.indexOf('=')+1).trim().replace(/;\s*$/,'')).regions;
 const houses=regions.flatMap(r=>r.houses.map(h=>({region:r.name,name:h.name,id:h.nobleId})));
 if(regions.length!==11||houses.length!==172||new Set(houses.map(h=>h.id)).size!==172)throw Error('catalog_changed');
 return {regions:regions.map(r=>r.name),houses};
}
const BASE='https://www.googleapis.com/drive/v3/files',token=process.env.DRIVE_ACCESS_TOKEN;
async function get(url,binary=false){
 if(!token||token.length<15)throw Error('drive_token_missing');
 for(let attempt=0;attempt<3;attempt++){
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});
  if(res.ok)return binary?Buffer.from(await res.arrayBuffer()):res.json();
  if((res.status===429||res.status>=500)&&attempt<2){await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;}
  throw Error('drive_http_'+res.status);
 }
}
async function list(q){
 let page,files=[];
 do{
  const u=new URL(BASE);u.searchParams.set('q',q);u.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,parents,trashed)');
  u.searchParams.set('pageSize','1000');u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');
  if(page)u.searchParams.set('pageToken',page);
  const d=await get(u.toString());if(!Array.isArray(d.files))throw Error('drive_bad_listing');
  files.push(...d.files.filter(f=>safeId(f.id)&&f.trashed!==true));
  if(files.length>10000)throw Error('drive_listing_limit');
  page=d.nextPageToken;
 }while(page);
 return files;
}
const children=id=>list("'"+id+"' in parents and trashed = false");
async function inventory(){
 const {regions,houses}=await catalog();
 let root=process.env.DRIVE_ROOT_FOLDER_ID;
 if(root&&!safeId(root))throw Error('drive_root_invalid');
 if(!root){
  const guesses=await list("name = 'Horselands' and mimeType = '"+FOLDER+"'");
  const parents=[...new Set(guesses.flatMap(x=>x.parents||[]))],ok=[];
  for(const parent of parents){
   if(!safeId(parent))continue;
   const f=(await children(parent)).filter(x=>x.mimeType===FOLDER);
   if(regions.every(name=>f.some(x=>norm(x.name)===norm(name))))ok.push(parent);
  }
  if(ok.length!==1)throw Error('drive_root_not_accessible_or_ambiguous');
  root=ok[0];
 }
 const regionFolders=(await children(root)).filter(x=>x.mimeType===FOLDER);
 let mapped=[],images=[];
 for(const region of regions){
  const hit=regionFolders.filter(f=>norm(f.name)===norm(region));
  if(hit.length!==1)throw Error('region_folder_missing_or_duplicate');
  const houseFolders=(await children(hit[0].id)).filter(f=>f.mimeType===FOLDER&&/^Casa\s/i.test(f.name));
  for(const h of houses.filter(h=>h.region===region)){
   const folder=houseFolders.filter(f=>canonical(f.name)===norm(h.name));
   if(folder.length!==1)throw Error('house_folder_missing_or_duplicate');
   mapped.push(h);
   async function walk(folderId,depth){
    if(depth>4)throw Error('folder_depth_limit');
    for(const f of await children(folderId)){
     if(f.mimeType===FOLDER){
      if(!/^(missivas?|missivas?legado|gestaodositenaomexer|privado|private)$/.test(norm(f.name)))
       await walk(f.id,depth+1);
     }else if(f.mimeType?.startsWith('image/')){
      if(!mimeTypes.has(f.mimeType))throw Error('unsafe_image_type');
      const size=Number(f.size);
      if(!Number.isSafeInteger(size)||size<1||size>max)throw Error('image_too_large_or_unknown');
      images.push({house:h.id,region:h.region,name:title(f.name),id:f.id,size,mime:f.mimeType});
     }
    }
   }
   await walk(folder[0].id,0);
  }
 }
 if(mapped.length!==172||images.length===0||images.length>5000)throw Error('incomplete_inventory');
 const counts=new Map();for(const i of images)counts.set(i.house,(counts.get(i.house)||0)+1);
 if([...counts.values()].some(n=>n>250))throw Error('house_too_many_images');
 console.log('GALLERY_SCAN houses='+mapped.length+' images='+images.length+' houses_with_images='+counts.size);
 return {houses,images};
}
async function collect(){
 const data=await inventory();
 await rm(work,{recursive:true,force:true});await mkdir(join(work,'bytes'),{recursive:true});
 const entries=[];
 for(let index=0;index<data.images.length;index+=5){
  const items=await Promise.all(data.images.slice(index,index+5).map(async f=>{
   const bytes=await get(BASE+'/'+encodeURIComponent(f.id)+'?alt=media&supportsAllDrives=true',true);
   if(bytes.length!==f.size||!signature(bytes,f.mime))throw Error('source_image_integrity');
   const sha=digest(bytes),file=digest(f.id+':'+sha).slice(0,48),path='public-house/'+f.house+'/'+file;
   await writeFile(join(work,'bytes',file),bytes,{flag:'wx'});
   return {house:f.house,region:f.region,name:f.name,size:f.size,mime:f.mime,sha,path,file};
  }));
  entries.push(...items);
 }
 await writeFile(join(work,'manifest.json'),JSON.stringify({format:1,houses:data.houses,images:entries}),{flag:'wx'});
 console.log('GALLERY_COLLECT verified='+entries.length);
}
async function publish(){
 const manifest=JSON.parse(await readFile(join(work,'manifest.json'),'utf8'));
 const {houses}=await catalog();
 if(manifest.format!==1||JSON.stringify(houses)!==JSON.stringify(manifest.houses)||
    !Array.isArray(manifest.images)||manifest.images.length>5000)throw Error('manifest_invalid');
 const {initializeApp,applicationDefault}=await import('firebase-admin/app');
 const {getFirestore}=await import('firebase-admin/firestore');
 const {getStorage}=await import('firebase-admin/storage');
 const app=initializeApp({credential:applicationDefault(),projectId:'cormyr'},'house-drive-sync');
 const db=getFirestore(app);
 const snapshots=(await db.collection('campaignWorkspaceImports').limit(8).get()).docs.filter(d=>
  /^[a-f0-9]{64}$/.test(d.id)&&d.data()?.status==='complete'&&d.data()?.private===true&&d.data()?.sourceSnapshotId===d.id);
 if(snapshots.length!==1)throw Error('snapshot_not_unique');
 const snap=snapshots[0].id,rref=db.collection('campaignCloudRuntime').doc(snap),
  stage=db.collection('migrationPublicContentStage').doc(snap);
 const [rDoc,sDoc]=await Promise.all([rref.get(),stage.get()]);
 const r=rDoc.data()||{},s=sDoc.data()||{};
 if(r.status!=='active'||r.private!==true||r.sourceSnapshotId!==snap||r.sourceSnapshotReconciled!==true||
    r.applicationEnabled!==true||s.status!=='complete'||s.private!==true||s.sourceSnapshotId!==snap||
    (r.publicGalleryBucket&&r.publicGalleryBucket!==bucketName))throw Error('publication_prerequisites_missing');
 const version=Number.isSafeInteger(r.galleryVersion)&&r.galleryVersion>0&&r.galleryVersion===r.publishedGalleryVersion?
  r.galleryVersion:Math.max(0,Number(r.galleryVersion)||0)+1;
 const bucket=getStorage(app).bucket(bucketName);
 const byHouse=new Map(houses.map(h=>[h.id,[]])),docs=[];
 // Validate ALL local bytes before the first cloud write.
 for(const f of manifest.images){
  if(!byHouse.has(f.house)||!mimeTypes.has(f.mime)||!/^public-house\/[a-z0-9-]{1,80}\/[a-f0-9]{48}$/.test(f.path)||
     !f.path.startsWith('public-house/'+f.house+'/')||f.file!==f.path.split('/').at(-1)||
     !/^[a-f0-9]{64}$/.test(f.sha)||!Number.isSafeInteger(f.size)||f.size<1||f.size>max)throw Error('entry_invalid');
  const b=await readFile(join(work,'bytes',f.file));
  if(b.length!==f.size||digest(b)!==f.sha||!signature(b,f.mime))throw Error('local_image_integrity');
  docs.push({...f,bytes:b});byHouse.get(f.house).push({path:f.path,name:title(f.name)});
 }
 if([...byHouse.values()].some(a=>a.length>250))throw Error('house_image_limit');
 for(const f of docs){
  const file=bucket.file('campaign-images/'+f.path);
  try{
   await file.save(f.bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},
    metadata:{contentType:f.mime,cacheControl:'private,no-store'}});
  }catch(e){
   if(![409,412].includes(Number(e?.code)))throw e;
   const [existing]=await file.download();
   if(digest(existing)!==f.sha)throw Error('storage_checksum_conflict');
  }
 }
 const refs=[];
 for(const f of docs)refs.push([stage.collection('gallery').doc(digest(f.path)),{
  status:'approved',publicReviewed:true,sourceSnapshotId:snap,version,path:f.path,bucketName,
  storagePath:'campaign-images/'+f.path,sha256:f.sha,sizeBytes:f.size,contentType:f.mime,
 }]);
 for(const h of houses)refs.push([stage.collection('houseGalleries').doc(h.id),{
  status:'approved',publicReviewed:true,sourceSnapshotId:snap,version,houseId:h.id,region:h.region,
  images:byHouse.get(h.id),
 }]);
 for(let x=0;x<refs.length;x+=350){
  const batch=db.batch();for(const [ref,values] of refs.slice(x,x+350))batch.set(ref,values);
  await batch.commit();
 }
 await db.runTransaction(async t=>{
  const fresh=(await t.get(rref)).data()||{};
  if(fresh.status!=='active'||fresh.sourceSnapshotId!==snap||
     fresh.galleryVersion!==r.galleryVersion||fresh.publishedGalleryVersion!==r.publishedGalleryVersion)
   throw Error('concurrent_publication_blocked');
  t.update(rref,{publicGalleryApproved:true,publicGalleryBucket:bucketName,
   galleryVersion:version,publishedGalleryVersion:version});
 });
 console.log('GALLERY_PUBLISHED houses='+houses.length+' images='+docs.length+' verified=true');
}
if(mode==='--scan')await inventory();
else if(mode==='--collect')await collect();
else if(mode==='--publish')await publish();
else throw Error('invalid_mode');
