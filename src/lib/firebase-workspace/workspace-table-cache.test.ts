import {describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({reads:0,fail:false}));
vi.mock('../../../scripts/firebase/workspace-import.mjs',()=>({WORKSPACE_ROOT:'campaignWorkspaceImports',workspaceTables:new Set(),readWorkspaceTable:async(_d:unknown,_s:string,n:string)=>{
  f.reads++;
  if(f.fail)throw Error('workspace_import_pending');
  return [{id:n+'-1',content:'acervo'}];
}}));
vi.mock('../../../scripts/firebase/cloud-readonly-service.mjs',()=>({CloudAccessError:class extends Error{},createFirebaseCloudReadonly:()=>({})}));
vi.mock('../../../scripts/firebase/cloud-mail-service.mjs',()=>({CloudMailError:class extends Error{},createFirebaseCloudMail:()=>({})}));
import {cachedWorkspaceTable} from './service';
const snap='a'.repeat(64);

describe('cache do acervo importado (login rápido)',()=>{
  it('lê cada tabela uma vez e entrega cópias independentes',async()=>{
    f.reads=0;f.fail=false;const db={};
    const first=await cachedWorkspaceTable(db,snap,'campaign_letters',1000);
    first[0]!['content']='alterado por uma consulta';
    const second=await cachedWorkspaceTable(db,snap,'campaign_letters',2000);
    expect(f.reads).toBe(1);
    expect(second[0]!['content']).toBe('acervo');
  });
  it('não guarda falhas: a próxima consulta tenta de novo',async()=>{
    f.reads=0;f.fail=true;const db={};
    await expect(cachedWorkspaceTable(db,snap,'letter_replies',1000)).rejects.toThrow('workspace_import_pending');
    f.fail=false;
    expect(await cachedWorkspaceTable(db,snap,'letter_replies',1001)).toHaveLength(1);
    expect(f.reads).toBe(2);
  });
  it('expira e separa por instância do Firestore e por acervo',async()=>{
    f.reads=0;f.fail=false;const a={},b={};
    await cachedWorkspaceTable(a,snap,'campaign_houses',0);
    await cachedWorkspaceTable(b,snap,'campaign_houses',0);
    await cachedWorkspaceTable(a,'b'.repeat(64),'campaign_houses',0);
    await cachedWorkspaceTable(a,snap,'campaign_houses',6*60*60_000+60_000);
    expect(f.reads).toBe(4);
  });
});
