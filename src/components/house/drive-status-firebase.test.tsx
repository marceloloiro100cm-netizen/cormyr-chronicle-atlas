import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';

const state=vi.hoisted(()=>({legacyFrom:vi.fn(),legacyExport:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{from:state.legacyFrom},
}));
vi.mock('@/lib/firebase-workspace/state',()=>({
 firebaseWorkspaceClient:()=>({firebase:true}),
}));
vi.mock('@/lib/visual-preview/server-fn',()=>({
 useServerFn:()=>state.legacyExport,
}));
vi.mock('@/lib/house/drive.functions',()=>({
 exportHouseToDrive:vi.fn(),
}));
import {HouseDriveStatus} from './drive-status';

afterEach(()=>{cleanup();state.legacyFrom.mockReset();state.legacyExport.mockReset();});

describe('Item 12: exportação da Ficha no workspace Firebase',()=>{
 it('informa homologação pendente sem consultar Supabase ou oferecer exportação enganosa',()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}>
   <HouseDriveStatus houseId="house-a" version={7} canEdit={true}/>
  </QueryClientProvider>);
  expect(screen.getByText(/sincronização com o Google Drive ainda não está homologada/i))
   .toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Atualizar Ficha no Drive/i}))
   .not.toBeInTheDocument();
  expect(state.legacyFrom).not.toHaveBeenCalled();
  expect(state.legacyExport).not.toHaveBeenCalled();
  client.clear();
 });
});
