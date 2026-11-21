import {describe,it,expect,vi,beforeEach} from 'vitest';

const state=vi.hoisted(()=>({
 storageFrom:vi.fn(),upload:vi.fn(),read:vi.fn(),clone:vi.fn(),
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{storage:{from:state.storageFrom}},
}));
vi.mock('./firebase-editorial-bridge',()=>({
 isFirebaseNewspaperWorkspace:()=>true,
}));
vi.mock('./firebase-newspaper-media.client',()=>({
 uploadFirebaseNewspaperMedia:state.upload,
 readFirebaseNewspaperMedia:state.read,
 cloneFirebaseNewspaperMedia:state.clone,
 isFirebaseNewspaperMediaPath:(path:string)=>
  path.startsWith('newspaper-media/'),
}));
import {uploadCommissionImage,signedCommissionImage,
 copyCommissionImageToEdition,copyBucketImageToEdition}
 from './data';

describe('Jornal Firebase: mídia exclusivamente pelo registro autorizado',()=>{
 beforeEach(()=>{for(const fn of Object.values(state))fn.mockReset();});
 it('envia encomendas ao Firebase sem tocar Storage legado ou debitar recursos',async()=>{
  state.upload.mockResolvedValue('newspaper-media/registered/commission/photo.png');
  const file=new File([new Uint8Array([137,80,78,71])],'foto.png',{type:'image/png'});
  expect(await uploadCommissionImage('house-a',file)).toContain('/commission/');
  expect(state.upload).toHaveBeenCalledWith({kind:'commission',houseId:'house-a',file});
  expect(state.storageFrom).not.toHaveBeenCalled();
 });
 it('lê e copia mídia vinculada sem tocar o bucket antigo',async()=>{
  state.read.mockResolvedValue('blob:preview');
  state.clone.mockResolvedValue('newspaper-media/registered/editionImage/photo.png');
  expect(await signedCommissionImage('newspaper-media/registered/commission/photo.png'))
   .toBe('blob:preview');
  expect(await copyCommissionImageToEdition('cloud-id','newspaper-media/registered/commission/photo.png','commission-id'))
   .toContain('/editionImage/');
  expect(state.clone).toHaveBeenCalledWith(
   'newspaper-media/registered/commission/photo.png','cloud-id','commission-id');
  await expect(copyBucketImageToEdition('legacy-bucket','cloud-id','legacy/photo.png'))
   .rejects.toThrow('não autorizada');
  expect(state.storageFrom).not.toHaveBeenCalled();
 });
 it('mídia legada não reconciliada permanece bloqueada',async()=>{
  await expect(signedCommissionImage('house-a/img.png')).rejects.toThrow('não reconciliada');
  expect(state.storageFrom).not.toHaveBeenCalled();
 });
});
