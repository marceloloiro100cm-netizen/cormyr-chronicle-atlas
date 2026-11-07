import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleV3NarratorEntry} from '@/components/battle/BattleV3NarratorEntry';
const source=(path:string)=>readFileSync(resolve(path),'utf8');

describe('Auditoria UX — módulo de batalha narrador',()=>{
 it('oferece uma ação principal PTE, alternativa V3 e ferramentas recolhíveis',()=>{
  render(<BattleNarratorHub/>);
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Batalha rápida com comandantes'})).toBeInTheDocument();
  expect(screen.getByText('Ferramentas avançadas e ajuda')).toBeInTheDocument();
  expect(screen.getByText(/preparar → posicionar → combater → rever o resultado/)).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Continuar batalha'})).toBeInTheDocument();
 });
 it('inicia combate fictício com três escolhas, sem posicionamento manual obrigatório',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  expect(screen.getByRole('heading',{name:'Configuração rápida'})).toBeInTheDocument();
  expect(screen.getByLabelText('Cenário rápido')).toBeInTheDocument();
  expect(screen.getByLabelText('Adversário rápido')).toHaveValue('ai');
  fireEvent.click(screen.getByRole('button',{name:'Iniciar combate com forças-modelo'}));
  expect(screen.getByRole('heading',{name:'Batalha experimental'})).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Mapa hexagonal/})).toBeInTheDocument();
 });
 it('mantém montagem completa de unidades, terreno e implantação ao solicitá-la',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  fireEvent.click(screen.getByRole('button',{name:'Personalizar unidades e mapa'}));
  expect(screen.getByRole('heading',{name:'2. Exércitos'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'3. Terreno'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'4. Implantação'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Posicionar automaticamente'})).toBeInTheDocument();
 });
 it('importação de tropas V3 fica antes da partida e não consulta origem por padrão',()=>{
  render(<BattleV3NarratorEntry onBack={vi.fn()}/>);
  const section=screen.getByLabelText('Preparação da batalha do Narrador');
  const summary=screen.getByText(/Opcional · Usar unidades existentes de uma casa/);
  const play=screen.getByRole('button',{name:'Batalhar'});
  expect(section.contains(summary)).toBe(true);
  expect(summary.compareDocumentPosition(play)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByLabelText('Casa de origem militar')).not.toBeInTheDocument();
 });
 it('mantém o acesso dos jogadores desativado, sem alterar o motor ou criar escrituras oficiais',()=>{
  const flags=source('src/lib/battle/feature-flag.ts');
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const quick=source('src/components/battle/BattleSetup.tsx');
  expect(flags).toContain('BATTLE_PLAYERS_ENABLED=false');
  expect(route).toContain("!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED");
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub/>");
  expect(quick).not.toMatch(/resolveSurvivors\(|changeUnitState\(|houseOperation\(/);
  expect(quick).toContain('makeFictionalStack');
  expect(source('src/components/battle/BattleNarratorHub.tsx'))
   .toContain("BATTLE_V3_LIVE_ENABLED");
 });
});
