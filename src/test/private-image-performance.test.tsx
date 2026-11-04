import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PrivateImage} from '@/components/campaign-content';

const mocks=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{storage:{from:()=>({download:mocks.download})}},
}));

function mount(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return render(<QueryClientProvider client={client}>
  <PrivateImage path="portraits/spy.webp" caption="Espião" thumbnail/>
 </QueryClientProvider>);
}

describe('deferred private portrait loading',()=>{
 beforeEach(()=>{
  mocks.download.mockReset();
  // Keep the request pending: the test measures whether it starts, not image decoding.
  mocks.download.mockImplementation(()=>new Promise(()=>{}));
 });
 afterEach(()=>{cleanup();vi.unstubAllGlobals();});

 it('does not fetch a portrait before it approaches the viewport',async()=>{
  let enterViewport:(()=>void)|undefined;
  class FakeIntersectionObserver{
   constructor(callback:IntersectionObserverCallback){
    enterViewport=()=>callback([{isIntersecting:true} as IntersectionObserverEntry],
     this as unknown as IntersectionObserver);
   }
   observe(){}
   disconnect(){}
  }
  vi.stubGlobal('IntersectionObserver',FakeIntersectionObserver);
  mount();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(enterViewport).toBeTypeOf('function');
  act(()=>enterViewport?.());
  await waitFor(()=>expect(mocks.download).toHaveBeenCalledTimes(1));
  expect(mocks.download).toHaveBeenCalledWith('portraits/spy.webp');
 });

 it('loads normally on browsers without IntersectionObserver',async()=>{
  vi.stubGlobal('IntersectionObserver',undefined);
  mount();
  await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith('portraits/spy.webp'));
 });
});
