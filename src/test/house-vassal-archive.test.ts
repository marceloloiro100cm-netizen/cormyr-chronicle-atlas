import {describe,it,expect} from 'vitest';
import {readVassalArchiveProfile,vassalArchiveReport} from '@/lib/house/vassal-archive';
import {RESOURCE_KEYS} from '@/lib/house/types';
const qazir={id:'qazir',name:'Qazir',region:'Dragon Coast',public_reviewed:true,
 archive_data:{crest:'assets/dragoncoast-qazir.webp',leader:'Rashid Qazir',
  motto:'Fire Finds a Way',castle:'Alcácer da Vigília',city:'Safraya',
  founding:'1115 CV',titles:'Guardião das Águas',
  symbol:'Lâmpada de óleo dourada com chama acesa',
  description:'Casa vassala dos Ashkar'}};
describe('ficha da vassala histórica Qazir',()=>{
 it('habilita o registro histórico público revisado e suas informações reais',()=>{
  const profile=readVassalArchiveProfile(qazir);
  expect(profile).toMatchObject({id:'qazir',lordName:'Rashid Qazir',castle:'Alcácer da Vigília',crest:'assets/dragoncoast-qazir.webp'});
 });
 it('rejeita registros não aprovados e preserva a separação de acesso',()=>{
  expect(readVassalArchiveProfile({...qazir,public_reviewed:false})).toBeNull();
  expect(readVassalArchiveProfile(null)).toBeNull();
 });
 it('produz relatório completo sem criar pontos de recurso, tropas ou domínios falsos',()=>{
  const profile=readVassalArchiveProfile(qazir)!;
  const sections=vassalArchiveReport(profile);
  expect(sections.map(s=>s.title)).toEqual(expect.arrayContaining(['Identidade','Recursos','Domínios','Tropas','Fortificações','Economia']));
  const resources=sections.find(s=>s.title==='Recursos')!;
  expect(resources.rows).toHaveLength(RESOURCE_KEYS.length);
  expect(resources.rows.every(row=>row[1]==='Não cadastrado na ficha mecânica')).toBe(true);
  const troops=sections.find(s=>s.title==='Tropas')!;
  expect(troops.rows[0]?.[0]).toContain('Não cadastrado');
  expect(sections.find(s=>s.title==='Identidade')?.rows).toContainEqual(['Lorde ou Lady','Rashid Qazir']);
 });
});
