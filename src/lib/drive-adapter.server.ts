import { envelopeSchema, filename, canonical, type DriveAdapter, type Envelope, type RemoteFile } from './drive-sync';
const GATEWAY_URL='https://connector-gateway.lovable.dev/google_drive';
export class DriveError extends Error { constructor(public status:number,public detail:string){super(`Google Drive: erro ${status}`);} }
export function createDriveAdapter(request:typeof fetch=fetch):DriveAdapter {
  const key=process.env['GOOGLE_DRIVE_API_KEY'],bearer=process.env['LOVABLE_API_KEY'];
  if(!key||!bearer)throw new Error('Credenciais runtime do Google Drive indisponíveis.');
  async function call(path:string,init:RequestInit={}){
    const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${bearer}`);headers.set('X-Connection-Api-Key',key);
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
      const etag=res.headers.get('etag');if(!etag)throw new Error('Drive não forneceu ETag; atualização bloqueada para preservar versões.');
      return {envelope:envelopeSchema.parse(JSON.parse(text)),etag};
    },
    async write(folder,e,file,etag){
      if(file&&!etag)throw new Error('Versão remota não confirmada.');
      if(!file){
        // Reserve ID before upload; retries locate it by stable canonical filename.
        const ids=await (await call('/drive/v3/files/generateIds?count=1&space=drive&type=files')).json() as {ids:string[]};
        const id=ids.ids[0];if(!id)throw new Error('Drive não retornou ID.');
        const boundary='cormyr_'+crypto.randomUUID();
        const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({id,name:filename(e),parents:[folder],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(e)}\r\n--${boundary}--`;
        await call('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});file=id;
      }else await call(`/upload/drive/v3/files/${encodeURIComponent(file)}?uploadType=media&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag??''},body:JSON.stringify(e)});
      const read=await adapter.read(file);if(canonical(read.envelope)!==canonical(e))throw new Error('Leitura de retorno divergiu; sincronização não confirmada.');
      return {id:file,...read};
    }
  };return adapter;
}
