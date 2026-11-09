import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {
 saveGotArchive,listGotArchives,loadGotArchive,deleteGotArchive,GOT_ARCHIVE_LIMIT,
} from '@/lib/battle/got/lab-archive';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {BattleGotGuide} from '@/components/battle/BattleGotGuide';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

const example=()=>createWarBattle({
 id:'archive-example',name:'Cerco de Treino',seed:'battle-archive-test',
 width:12,height:7,commanders:modelWarCommanders({attacker:5,defender:5}),
 units:[
  modelWarUnit({id:'a',name:'Atacante',side:'attacker',typeId:'infantry',position:{x:2,y:3}}),
  modelWarUnit({id:'d',name:'Defensor',side:'defender',typeId:'archers',position:{x:9,y:3}}),
 ],
});
afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});

describe('Lote 4: fases do livro e preparação acessível',()=>{
 it('mostra as seis fases sem pular regras e destaca a fase correta',()=>{
  render(<BattleGotGuide phase="orders"/>);
  const guide=screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'});
  expect(guide.querySelectorAll('li')).toHaveLength(6);
  expect(guide.querySelector('[aria-current="step"]')).toHaveTextContent('Ordens');
  expect(screen.getByText(/teste Guerra contra Disciplina/i)).toBeInTheDocument();
 });
 it('oferece configuração rápida não destrutiva e navegação na preparação',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Aplicar cenário rápido'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Clima'),{target:{value:'heavy-rain'}});
  fireEvent.click(screen.getByRole('button',{name:'Aplicar cenário rápido'}));
  expect(screen.getByLabelText('Clima')).toHaveValue('clear');
  fireEvent.click(screen.getByRole('button',{name:'Iniciar simulação pelo livro'}));
  expect(screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'}))
   .toBeInTheDocument();
 });
});

describe('Lote 5: cópias locais por perfil e retenção',()=>{
 it('grava, carrega e exclui cópias válidas isoladas entre jogador e narrador',()=>{
  const battle=example(),store=window.localStorage;
  const saved=saveGotArchive(store,'narrator','Cerco 01',battle);
  expect(listGotArchives(store,'narrator')[0]?.label).toBe('Cerco 01');
  expect(listGotArchives(store,'player')).toHaveLength(0);
  expect(loadGotArchive(store,'narrator',saved.id)).toEqual(battle);
  expect(()=>loadGotArchive(store,'player',saved.id)).toThrow(/não encontrada/);
  deleteGotArchive(store,'narrator',saved.id);
  expect(listGotArchives(store,'narrator')).toHaveLength(0);
  expect(()=>loadGotArchive(store,'narrator',saved.id)).toThrow();
 });
 it('limita a oito cópias sem destruir a última salva',()=>{
  const battle=example(),store=window.localStorage;
  for(let i=0;i<12;i++)saveGotArchive(store,'narrator','Partida '+i,battle);
  const archives=listGotArchives(store,'narrator');
  expect(archives).toHaveLength(GOT_ARCHIVE_LIMIT);
  expect(archives[0]?.label).toBe('Partida 11');
  expect(archives.some(x=>x.label==='Partida 0')).toBe(false);
  expect(loadGotArchive(store,'narrator',archives[0]!.id).round).toBe(1);
 });
 it('recusa snapshots adulterados e não consulta dados do servidor',()=>{
  const store=window.localStorage;
  const saved=saveGotArchive(store,'player','Modelo',example());
  store.setItem('cormyr-got-archive-v1-player:'+saved.id,'{"invalid":true}');
  expect(()=>loadGotArchive(store,'player',saved.id)).toThrow(/não é compatível/);
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
 });
});
