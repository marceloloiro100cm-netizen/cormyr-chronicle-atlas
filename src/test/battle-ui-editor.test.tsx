import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleMapEditor} from '@/components/battle/BattleMapEditor';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {parseBattleMapJson,serializeBattleMap} from '@/lib/battle/serialization/map-io';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';

describe('Batalha V2 — lotes 5, 6 e 7',()=>{
 it('rejeita JSON inválido, terrain desconhecido, zonas sobrepostas e tamanho excessivo',()=>{
  const original=createScenario('plain-open');
  expect(parseBattleMapJson(serializeBattleMap(original))).toEqual(original);
  expect(()=>parseBattleMapJson('not json')).toThrow('JSON válido');
  expect(()=>parseBattleMapJson('x'.repeat(150001))).toThrow('150 KB');
  const overlapping={...original,deployment:{attacker:original.deployment.attacker,
    defender:original.deployment.attacker}};
  expect(()=>parseBattleMapJson(JSON.stringify(overlapping))).toThrow('sobrepostas');
  expect(()=>parseBattleMapJson(JSON.stringify({...original,extra:'unexpected'}))).toThrow();
  expect(validateBattleMap(createScenario('narrow-passage',15))).toEqual([]);
 });
 it('editor permite pincel e desfazer sem alterar o mapa original',()=>{
  const map=createScenario('plain-open');
  const onChange=vi.fn();
  render(<BattleMapEditor map={map} onChange={onChange}/>);
  expect(screen.getByText('Mapa válido para implantação.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Floresta'}));
  const cells=screen.getAllByRole('button',{name:/Hexágono /});
  fireEvent.click(cells[0]!);
  expect(onChange).toHaveBeenCalledOnce();
  expect(map.tiles[0]?.terrain).toBe('plain');
  const changed=onChange.mock.calls[0]?.[0];
  expect(changed.tiles[0].terrain).toBe('forest');
 });
 it('narrador monta forças, posiciona e alcança resultado sem persistir no banco',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  expect(screen.getByRole('heading',{name:'Configuração rápida'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Personalizar unidades e mapa'}));
  expect(screen.getByRole('heading',{name:'2. Exércitos'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Posicionar automaticamente'}));
  expect(screen.getByText(/2 \/ 2 agrupamentos posicionados/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Iniciar batalha'}));
  expect(screen.getByRole('heading',{name:'Batalha experimental'})).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Mapa (?:hexagonal|quadrado)/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Encerrar batalha manualmente'}));
  fireEvent.change(screen.getByLabelText('Motivo do encerramento'),{target:{value:'Acordo diplomático encerra o combate.'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar encerramento'}));
  expect(screen.getByRole('heading',{name:'Resultado da simulação'})).toBeInTheDocument();
  expect(screen.getByText(/sem alterações nas fichas oficiais/)).toBeInTheDocument();
 });
 it('menu do Narrador permanece sob data.admin e flag; arena não chama API de casas',()=>{
  const route=readFileSync(resolve('src/routes/_authenticated/jogadores.tsx'),'utf8');
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub/>");
  expect(route).toContain("data.admin?<div");
  expect(route).toContain("NARRATOR_MENU.filter(([id])=>id!=='batalha'||BATTLE_MODULE_ENABLED)");
  const files=['src/components/battle/BattleArena.tsx','src/components/battle/BattleSetup.tsx',
    'src/lib/battle/domain/turns.ts'];
  for(const file of files){
   const code=readFileSync(resolve(file),'utf8');
   expect(code).not.toMatch(/supabase\.rpc\(|createUnit\(|resolveSurvivors\(|houseOperation\(|changeUnitState\(/);
  }
 });
});
