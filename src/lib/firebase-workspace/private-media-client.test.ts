import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const session=vi.hoisted(()=>({uid:'player',token:vi.fn()}));
vi.mock('@/lib/auth/firebase-pilot-session',()=>({
 firebasePilotAuth:()=>({current:()=>({uid:session.uid}),getToken:session.token}),
}));
import {mediaUploadId,downloadFirebasePrivateImage} from './private-media-client';
beforeEach(()=>{session.uid='player';session.token.mockReset().mockResolvedValue('verified-token');});
afterEach(()=>vi.useRealTimers());

describe('ponte de imagens Firebase',()=>{
 it('gera UUID estável por tentativa e diferencia posições',async()=>{
  const key='11111111-1111-4111-8111-111111111111';
  const first=await mediaUploadId(key,0);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(await mediaUploadId(key,0)).toBe(first);
  expect(await mediaUploadId(key,1)).not.toBe(first);
 });
 it('rejeita mutações inválidas',async()=>{
  await expect(mediaUploadId('unsafe-path',0)).rejects.toThrow(/Identificador/);
  await expect(mediaUploadId('11111111-1111-4111-8111-111111111111',-1))
   .rejects.toThrow(/Identificador/);
 });
 it('não deixa imagem da galeria em carregamento eterno quando token não responde',async()=>{
  vi.useFakeTimers();
  session.token.mockImplementation(()=>new Promise(()=>{}));
  const pending=downloadFirebasePrivateImage('historico/retrato.png');
  const check=expect(pending).rejects.toThrow('A imagem demorou além do limite');
  await vi.advanceTimersByTimeAsync(18_001);
  await check;
 });

 it('permite imagem após o primeiro refresh hidratar o UID do Firebase',async()=>{
  session.uid='';
  session.token.mockImplementation(async()=>{session.uid='player';return 'verified-token';});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({
   ok:true,headers:new Headers({'content-type':'image/png'}),
   blob:async()=>new Blob(['original'],{type:'image/png'}),
  }));
  try{
   const data=await downloadFirebasePrivateImage('historico/retrato.png');
   expect(data.size).toBeGreaterThan(0);
   expect(fetch).toHaveBeenCalledTimes(1);
  }finally{vi.unstubAllGlobals();}
 });
 it('não autoriza download após troca de identidade no refresh',async()=>{
  session.token.mockImplementation(async()=>{session.uid='other';return 'token';});
  vi.stubGlobal('fetch',vi.fn());
  try{
   await expect(downloadFirebasePrivateImage('historico/retrato.png'))
    .rejects.toThrow('Sessão Firebase encerrada');
   expect(fetch).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
 });

});
