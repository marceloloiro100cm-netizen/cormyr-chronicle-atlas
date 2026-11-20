import {describe,it,expect,vi,beforeEach} from 'vitest';

const state=vi.hoisted(()=>({storageFrom:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{storage:{from:state.storageFrom}},
}));
vi.mock('./firebase-editorial-bridge',()=>({
 isFirebaseNewspaperWorkspace:()=>true,
}));
import {uploadCommissionImage,signedCommissionImage,
 copyCommissionImageToEdition,copyBucketImageToEdition}
 from './data';

describe('Jornal Firebase: nunca utilizar buckets legados para encomendas',()=>{
 beforeEach(()=>state.storageFrom.mockReset());
 it('recusa anexos de encomenda antes de tocar Storage antigo ou debitar Riqueza',async()=>{
  const file=new File([new Uint8Array([137,80,78,71])],'foto.png',
   {type:'image/png'});
  await expect(uploadCommissionImage('house-a',file))
   .rejects.toThrow('Imagens de encomendas ainda aguardam homologação');
  expect(state.storageFrom).not.toHaveBeenCalled();
 });
 it('não gera URL nem copia imagens históricas pelo bucket legado',async()=>{
  await expect(signedCommissionImage('house-a/img.png'))
   .rejects.toThrow('não reconciliada');
  await expect(copyCommissionImageToEdition('edition-1','house-a/img.png'))
   .rejects.toThrow('não aprovada');
  await expect(copyBucketImageToEdition('legacy-bucket','edition-1','house-a/img.png'))
   .rejects.toThrow('não aprovada');
  expect(state.storageFrom).not.toHaveBeenCalled();
 });
});
