import { envelopeSchema, filename, canonical, digest, type DriveAdapter, type RemoteFile } from './drive-sync';
import { contentParts } from './campaign-content';
const GATEWAY_URL='https://connector-gateway.lovable.dev/google_drive';
export class DriveError extends Error { constructor(public status:number,public detail:string){super(`Google Drive: erro ${status}`);} }
export function createDriveAdapter(request:typeof fetch=fetch):DriveAdapter {
  const key=process.env['GOOGLE_DRIVE_API_KEY'],bearer=process.env['LOVABLE_API_KEY'];
  if(!key||!bearer)throw new Error('Credenciais runtime do Google Drive indisponíveis.');
  const runtimeKey=key,runtimeBearer=bearer;
  async function call(path:string,init:RequestInit={}){
    const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${runtimeBearer}`);headers.set('X-Connection-Api-Key',runtimeKey);
    const res=await request(GATEWAY_URL+path,{...init,headers,signal:AbortSignal.timeout(8000)});
    if(!res.ok){const body=await res.text();console.error(`Drive [${res.status}]: ${body}`);throw new DriveError(res.status,body);}
    return res;
  }
  const adapter:DriveAdapter={
    async list(folder){
      if(!/^[a-zA-Z0-9_-]+$/.test(folder))throw new Error('ID de pasta inválido.');
      const files:RemoteFile[]=[];let token:string|undefined;
      do {const q=new URLSearchParams({q:`'${folder}' in parents and trashed=false and mimeType='application/json' and name contains 'cormyr-'`,fields:'nextPageToken,files(id,name,parents,mimeType,size)',pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(token)q.set('pageToken',token);
        const res=await call('/drive/v3/files?'+q);const body=await res.json() as {files:RemoteFile[];nextPageToken?:string};files.push(...body.files);token=body.nextPageToken;
        if(files.length>1000)throw new Error('Pasta excede o lote permitido; revisão administrativa necessária.');
      }while(token);return files;
    },
    async read(file){
      const res=await call(`/drive/v3/files/${encodeURIComponent(file)}?alt=media&supportsAllDrives=true`);
      const text=await res.text();if(text.length>2_100_000)throw new Error('Arquivo acima do limite.');
      const envelope=envelopeSchema.parse(JSON.parse(text));
      // A hash is a read-back identity, NEVER a conditional-write token.
      const etag=res.headers.get('etag')??'sha256:'+await digest(envelope);
      return {envelope,etag};
    },
    async write(folder,e,file,etag){
      if(file&&!etag)throw new Error('Versão remota não confirmada.');
      if(!/^[a-zA-Z0-9_-]+$/.test(folder))throw new Error('ID de pasta inválido.');
      for(const part of contentParts(e.content)) {
        if('text' in part)continue;
        if(part.path.split('/').some(segment=>!segment||segment==='.'||segment==='..')||!/^[a-zA-Z0-9_./-]+$/.test(part.path))throw new Error('Referência de imagem inválida.');
        const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
        const image=await supabaseAdmin.storage.from('campaign-images').download(part.path);if(image.error)throw image.error;
        const bytes=await image.data.arrayBuffer();
        const imageName='cormyr-image-'+part.path.replaceAll('/','_');
        const q=new URLSearchParams({q:`'${folder}' in parents and trashed=false and name='${imageName}'`,fields:'files(id,name)',pageSize:'10'});
        const found=await (await call('/drive/v3/files?'+q)).json() as {files:{id:string}[]};
        if(found.files.length>1)throw new Error('Imagens duplicadas; revisão necessária.');
        let imageId=found.files[0]?.id;
        if(!imageId){
          const boundary='image_'+crypto.randomUUID();
          const body=new Blob([`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:imageName,parents:[folder],mimeType:image.data.type})}\r\n--${boundary}\r\nContent-Type: ${image.data.type}\r\n\r\n`,bytes,`\r\n--${boundary}--`]);
          const metadata=await (await call('/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json() as {id:string};imageId=metadata.id;
        }
        const returned=await (await call(`/drive/v3/files/${imageId}?alt=media`)).arrayBuffer();
        const hash=async(b:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).join(',');
        if(await hash(bytes)!==await hash(returned))throw new Error('Imagem no Drive divergiu; sincronização não confirmada.');
      }
      const appendOnly=!file||etag?.startsWith('sha256:');
      if(appendOnly){
        // Without a provider ETag, append a content-addressed version. Never overwrite the original.
        const versionName=filename(e).replace('.json',`-v${e.version}-${await digest(e)}.json`);
        const query=new URLSearchParams({q:`'${folder}' in parents and trashed=false and name='${versionName}'`,fields:'files(id,name)',pageSize:'10'});
        const existing=await (await call('/drive/v3/files?'+query)).json() as {files:{id:string}[]};
        if(existing.files.length>1)throw new Error('Versões duplicadas; revisão necessária.');
        const previous=existing.files[0];
        if(previous){const read=await adapter.read(previous.id);if(canonical(read.envelope)!==canonical(e))throw new Error('Versão existente divergiu.');return {id:previous.id,...read};}
        // Reserve ID before upload; retries locate it by stable canonical filename.
        const ids=await (await call('/drive/v3/files/generateIds?count=1&space=drive&type=files')).json() as {ids:string[]};
        const id=ids.ids[0];if(!id)throw new Error('Drive não retornou ID.');
        const boundary='cormyr_'+crypto.randomUUID();
        const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({id,name:versionName,parents:[folder],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(e)}\r\n--${boundary}--`;
        await call('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});file=id;
      }else{if(!file)throw new Error('Arquivo remoto não confirmado.');await call(`/upload/drive/v3/files/${encodeURIComponent(file)}?uploadType=media&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag??''},body:JSON.stringify(e)});}
      if(!file)throw new Error('Drive não confirmou o arquivo.');
      const read=await adapter.read(file);if(canonical(read.envelope)!==canonical(e))throw new Error('Leitura de retorno divergiu; sincronização não confirmada.');
      return {id:file,...read};
    }
  };return adapter;
}
