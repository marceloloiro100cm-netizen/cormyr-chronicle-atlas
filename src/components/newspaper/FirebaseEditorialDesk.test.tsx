import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FirebaseEditorialDesk} from './FirebaseEditorialDesk';
vi.mock('@/lib/auth/firebase-pilot-session',()=>({
  firebasePilotAuth:()=>({getToken:async()=>'synthetic-editor-id-token'}),
}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Firebase editorial workspace',()=>{
  it('preserves draft on failure and retries the same operation key, without cookies',async()=>{
    const saves:Record<string,unknown>[]=[];
    let fail=true;
    vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{
      expect(options.credentials).toBe('omit');
      const body=JSON.parse(String(options.body));
      if(body.action==='listEditorial')return Response.json({result:{items:[]}});
      saves.push(body);
      if(fail)return Response.json({error:'temporary'},{status:503});
      return Response.json({result:{id:'cloud-test',editionNo:14,version:1,state:'draft',
        ...body.content,campaignDate:'1522-01-11',publishedAt:null}});
    }));
    render(<FirebaseEditorialDesk onChanged={()=>{}}/>);
    await screen.findByText(/Nenhuma edição criada/);
    fireEvent.click(screen.getByRole('button',{name:'Criar edição'}));
    fireEvent.change(screen.getAllByLabelText('Texto')[0]!,{target:{value:'Notícia importante'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
    await screen.findByText(/Seu texto permanece nesta tela/);
    expect(screen.getAllByLabelText('Texto')[0]).toHaveValue('Notícia importante');
    fail=false;
    fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
    await screen.findByText(/Alterações salvas/);
    expect(saves).toHaveLength(2);
    expect(saves[0]!['requestKey']).toBe(saves[1]!['requestKey']);
    await waitFor(()=>expect(screen.getByText('Edição 14')).toBeInTheDocument());
  });
});

