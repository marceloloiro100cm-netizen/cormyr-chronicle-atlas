import {describe,it,expect} from 'vitest';
import {spyRegionLinkInput} from '@/lib/espionage/region-review-schema';
const item={
 id:'11111111-1111-4111-8111-111111111111',
 fromRegion:'helmlands',toRegion:'shieldmark',
 passage:'land_neighbor' as const,bidirectional:true,approved:true as const,
 blocked:false as const,visibility:'public' as const,
 source:'Mapa oficial de fronteiras da campanha',reason:'Fronteira validada pelo Narrador',
 requestKey:'22222222-2222-4222-8222-222222222222',
};
describe('Cadastro narratorial de conexões regionais',()=>{
 it('admite duas regiões válidas com evidência e revisão',()=>expect(spyRegionLinkInput.safeParse(item).success).toBe(true));
 it('nega ligar região consigo mesma',()=>expect(spyRegionLinkInput.safeParse({...item,toRegion:'helmlands'}).success).toBe(false));
 it('nega regiões inexistentes',()=>expect(spyRegionLinkInput.safeParse({...item,toRegion:'made-up-region'}).success).toBe(false));
 it('nega rota sem referência a mapa',()=>expect(spyRegionLinkInput.safeParse({...item,source:'???'}).success).toBe(false));
 it('nega atalhos aprovados por cliente sem justificação',()=>expect(spyRegionLinkInput.safeParse({...item,reason:'sem fonte'}).success).toBe(false));
 it('nega campos extras para evitar elevação de permissões',()=>expect(spyRegionLinkInput.safeParse({...item,isAdmin:true}).success).toBe(false));
 it('suporta travessia marítima comprovada',()=>expect(spyRegionLinkInput.safeParse({...item,passage:'sea_passage',bidirectional:false}).success).toBe(true));
});
