import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 SPY_INTELLIGENCE_OBJECTIVES,SPY_INTELLIGENCE_RESOURCE_KEYS,
 spyIntelligenceCapacity,spyIntelligenceAllocation,
} from '@/lib/espionage/spy-intelligence-rules';

const read=(p:string)=>readFileSync(p,'utf8');
const migration=()=>read('docs/espionage/sql/0104_spy_intelligence_dossiers_lotes_1_3.sql');

describe('Dossiês de espionagem · primeiros 3 lotes',()=>{
 it('oferece as três modalidades no planejador antes da confirmação',()=>{
  expect(SPY_INTELLIGENCE_OBJECTIVES.map(x=>x.id))
   .toEqual(['house_resources','army','possessions']);
  const ui=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const confirmation=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  const client=read('src/lib/espionage/spy-browser-client.ts');
  expect(ui).toContain('Objetivo da espionagem');
  expect(ui).toContain('SPY_INTELLIGENCE_OBJECTIVES.map');
  expect(confirmation).toContain('destinationRegion,objective,');
  expect(confirmation).toContain('<strong>Objetivo:</strong>');
  expect(confirmation).not.toContain('id="spy-mission-objective"');
  expect(client).toContain('p_objective:input.objective');
  expect(client).toContain('parsed.data.objective!==input.objective');
 });
 it('concede 3 atributos básicos e +1 por grau positivo até +4',()=>{
  expect([0,4,5,9,10,14,15,19,20,40].map(spyIntelligenceCapacity))
   .toEqual([3,3,4,4,5,5,6,6,7,7]);
  expect(()=>spyIntelligenceCapacity(-1)).toThrow();
  expect(SPY_INTELLIGENCE_RESOURCE_KEYS).toHaveLength(7);
  expect(migration()).toContain("v_margin:=(NEW.modifiers->>'roll')::integer+");
  expect(migration()).toContain('p_margin::numeric/5');
 });
 it('revela primeiro itens ainda desconhecidos, sem duplicação',()=>{
  const first=spyIntelligenceAllocation([],['defense','law','wealth'],3);
  expect(first).toEqual({newKeys:['defense','law','wealth'],refreshKeys:[]});
  const second=spyIntelligenceAllocation(first.newKeys,[
   'defense','law','wealth','power','lands','influence','population'
  ],4);
  expect(second.newKeys).toEqual(['power','lands','influence','population']);
  expect(second.refreshKeys).toEqual([]);
  const full=spyIntelligenceAllocation([...first.newKeys,...second.newKeys],
   [...SPY_INTELLIGENCE_RESOURCE_KEYS],3);
  expect(full.newKeys).toEqual([]);
  expect(full.refreshKeys).toHaveLength(3);
 });
 it('mantém inteligência isolada por Casa e operação única, sem SELECT público',()=>{
  const sql=migration();
  expect(sql).toContain('UNIQUE(owner_house_id,target_house_id)');
  expect(sql).toContain('UNIQUE(dossier_id,objective,subject_key)');
  expect(sql).toContain('operation_id uuid PRIMARY KEY REFERENCES public.spy_operations(id)');
  expect(sql).toContain('ALTER TABLE public.spy_intelligence_findings ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('REVOKE ALL ON public.spy_intelligence_findings FROM PUBLIC,anon,authenticated');
  expect(sql).toContain("v_objective NOT IN('house_resources','army','possessions')");
  expect(sql).toContain('AFTER INSERT ON public.spy_mission_decisions');
  expect(sql).toContain("NEW.resolution<>'success'");
  expect(sql).toContain('waiting_catalog');
 });
});
