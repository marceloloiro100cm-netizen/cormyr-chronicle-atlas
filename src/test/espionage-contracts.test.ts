import {describe,it,expect} from 'vitest';
import {spyAssetSchema,spyLocationSchema,spyTravelEdgeSchema,spyDateKeySchema,spyRequestFieldsSchema,SPY_REQUEST_FIELDS} from '@/lib/espionage/contracts';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
describe('Espionagem · Lote 1 contratos',()=>{
 it('recusa data gregoriana impossível e reconhece festival intercalar',()=>{
  expect(spyDateKeySchema.safeParse('1524-F-shieldmeet').success).toBe(true);
  expect(spyDateKeySchema.safeParse('1522-F-shieldmeet').success).toBe(false);
  expect(spyDateKeySchema.safeParse('2026-11-31').success).toBe(false);
 });
 it('exige fonte, versão, autor e justificativa para aresta aprovada',()=>{
  const edge={id:a,fromLocationId:a,toLocationId:b,mode:'horse',baseDays:4,bidirectional:true,blocked:false,approved:true,version:1,source:'Carta regional autenticada'};
  expect(spyTravelEdgeSchema.safeParse(edge).success).toBe(false);
  expect(spyTravelEdgeSchema.safeParse({...edge,approvedByNarratorId:'gm-1',approvalReason:'Revisado com os mapas oficiais'}).success).toBe(true);
  expect(spyTravelEdgeSchema.safeParse({...edge,baseDays:-1}).success).toBe(false);
 });
 it('não aceita célula sem posse de origem nem atributos secretos arbitrários',()=>{
  const asset={id:a,ownerHouseId:'evenhand',kind:'network_cell',label:'Célula rubra',sourceRef:'catalog',currentLocationId:b,status:'available',rulesVersion:'v1',version:1};
  expect(spyAssetSchema.safeParse(asset).success).toBe(false);
  expect(spyAssetSchema.safeParse({...asset,sourceHoldingId:b}).success).toBe(true);
  expect(spyAssetSchema.safeParse({...asset,sourceHoldingId:b,targetPrivateData:'leak'}).success).toBe(false);
 });
 it('catálogo de campos é fechado e não habilita acesso a dados do alvo',()=>{
  expect(SPY_REQUEST_FIELDS.length).toBeGreaterThan(5);
  expect(spyRequestFieldsSchema.safeParse(['house_name','house_army']).success).toBe(true);
  expect(spyRequestFieldsSchema.safeParse(['login_password']).success).toBe(false);
  expect(spyRequestFieldsSchema.safeParse(['house_name','house_name']).success).toBe(false);
  expect(spyLocationSchema.safeParse({id:a,kind:'region',refId:'helmlands',name:'Helmlands',regionId:'helmlands',visibility:'public',approved:false,version:1,source:'regions.ts'}).success).toBe(true);
 });
});