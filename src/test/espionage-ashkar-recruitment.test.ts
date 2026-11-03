import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyRecruitmentOptionsSchema} from '@/lib/espionage/spy-recruitment.functions';
const file=(p:string)=>readFileSync(resolve(p),'utf8');
describe('Ashkar · vagas de espiões',()=>{
 it('separa Rede de Espiões com 3 vagas da Rede Ampliada com 2 vagas',()=>{
  const raw={houseId:'ashkar',recruitment:[
   {sourceHoldingId:'hold-ashkar-spy',name:'Rede de Espiões',capacity:3,occupied:1,vacancies:2},
   {sourceHoldingId:'hold-ashkar-spy-exp',name:'Rede Expandida',capacity:2,occupied:2,vacancies:0},
  ],portraits:[]};
  expect(spyRecruitmentOptionsSchema.parse(raw).recruitment.filter(x=>x.vacancies>0)
   .map(x=>x.sourceHoldingId)).toEqual(['hold-ashkar-spy']);
  const sql=file('docs/espionage/sql/0096_spy_recruitment_options_independent.sql');
  expect(sql).toContain("WHEN 'pros-spy-network' THEN 3");
  expect(sql).toContain("WHEN 'pros-spy-network--expanded-network' THEN 2");
  expect(sql).toContain("a.source_holding_id=h->>'id'");
  expect(sql).toContain("n.house_id=p_house");
 });
 it('retorna retratos somente da Casa autenticada e impede consulta anônima',()=>{
  const sql=file('docs/espionage/sql/0096_spy_recruitment_options_independent.sql');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain('auth.uid() IS NULL');
  expect(sql).toContain('a.owner_house_id=p_house');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_recruitment_options(text) FROM PUBLIC,anon');
 });
 it('exibe estado de carregamento/erro em vez de dizer que faltam redes',()=>{
  const s=file('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(s).toContain("queryKey:['spy-recruitment-options',houseId]");
  expect(s).toContain('enabled:open');
  expect(s).toContain('loadingOptions&&');
  expect(s).toContain('optionsError&&');
  expect(s).toContain('não significa');
  expect(s).toContain("Boolean(options)&&!loadingOptions&&!optionsError&&!slots.length");
  expect(s).toContain('onClick={()=>void refetch()}');
 });
 it('consulta avulsa não cria agentes nem altera Riqueza',()=>{
  const sql=file('docs/espionage/sql/0096_spy_recruitment_options_independent.sql');
  expect(sql).toContain('LANGUAGE plpgsql STABLE');
  expect(sql).not.toMatch(/INSERT INTO|UPDATE public\.spy_assets|DELETE FROM/i);
 });
});
