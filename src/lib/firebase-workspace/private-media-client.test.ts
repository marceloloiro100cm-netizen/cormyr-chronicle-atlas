import {describe,it,expect,vi} from 'vitest';
import {mediaUploadId} from './private-media-client';

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
});
