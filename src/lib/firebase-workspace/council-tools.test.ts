import {afterEach,describe,expect,it,vi} from 'vitest';
import {councilCloudRequest} from './council-tools';

vi.mock('@/lib/auth/firebase-pilot-session',()=>({
  firebasePilotAuth:()=>({getToken:async()=> 'firebase-token-only'}),
}));
afterEach(()=>vi.unstubAllGlobals());

describe('Ferramentas de Conselho Firebase',()=>{
  it('usa somente o token Firebase e não envia cookies',async()=>{
    const fetchMock=vi.fn(async()=>Response.json({result:{checked:true}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(councilCloudRequest<{checked:boolean}>(
      '/api/firebase-cloud-read',{action:'listAccessRemediation'},
    )).resolves.toEqual({checked:true});
    const [endpoint,request]=fetchMock.mock.calls[0] as unknown as
      [string,RequestInit];
    expect(endpoint).toBe('/api/firebase-cloud-read');
    expect(request.credentials).toBe('omit');
    expect(request.headers).toMatchObject({
      Authorization:'Bearer firebase-token-only',
    });
    expect(JSON.parse(String(request.body))).toEqual({
      action:'listAccessRemediation',
    });
  });
  it('bloqueia falta de permissão e versão desatualizada',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
    await expect(councilCloudRequest(
      '/api/firebase-cloud-treasury',{action:'adjust'},
    )).rejects.toThrow('não autoriza');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:409})));
    await expect(councilCloudRequest(
      '/api/firebase-cloud-treasury',{action:'adjust'},
    )).rejects.toThrow('Versão desatualizada');
  });
});
