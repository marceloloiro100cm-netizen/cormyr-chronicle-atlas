import {describe,it,expect} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {buildCharacterPlayerPreview,CharacterV2PlayerSheet} from '@/components/character-v2/player-sheet';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';

const ID='00000000-0000-4000-8000-000000000088';
const skills=[
 ['Agilidade',2],['Astucia',4],['Atletismo',3],['Conhecimento',4],
 ['Cura',2],['Enganação',2],['Furtividade',2],['Guerra',2],['Idioma',2],
 ['Ladinagem',2],['Luta',3],['Percepção',3],['Persuasão',2],['Pontaria',2],
 ['Sobrevivencia',2],['Status',4],['Vigor',3],['Vontade',3],
] as const;
const original=[
 'Página1 "Ficha de personagem GOT" · · ·',
 '"Nome do Personagem" · "Aldaeric Erdenor"',
 'Casa · Erdenor',
 'Graduação · Habilidade · Especialização',
 ...skills.map(([name,rank])=>rank+' · '+name+' · '+(name==='Astucia'?'Lógica (2)':'')),
 'Corrida · 0',
].join('\n');
const record={id:ID,title:'Ficha - Lorde',kind:'character',content:original,version:1};

describe('Implantação de consulta V2 — fichas reais legadas',()=>{
 it('reconhece 18 habilidades da planilha, nunca credita a ausente como 2 comprado',()=>{
  const result=buildCharacterPlayerPreview(record,'erdenor');
  expect(result).not.toBeNull();
  expect(result!.known.size).toBe(18);
  expect(result!.known.has('animalHandling')).toBe(false);
  expect(result!.character.skillRanks.cunning).toBe(4);
  expect(result!.allPending.some(w=>w.includes('Lidar com Animais'))).toBe(true);
  expect(result!.character.source.originalContent).toBe(original);
 });
 it('mostra bolinhas, indicadores de base e pendências sem controles de compra',()=>{
  render(<CharacterV2PlayerSheet record={record} houseId="erdenor"/>);
  expect(screen.getByRole('region',{name:'Nova apresentação da ficha de Aldaeric Erdenor'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Graduações em bolinhas'})).toBeInTheDocument();
  const cunning=screen.getByRole('group',{name:/Astúcia: 4 de 7/});
  expect(cunning.querySelectorAll('.is-filled')).toHaveLength(4);
  expect(within(cunning).queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByLabelText('Lidar com Animais: graduação pendente')).toBeInTheDocument();
  expect(screen.getByText('Lógica (2)')).toBeInTheDocument();
  expect(screen.getByText(/Nenhum ponto de XP, Destino, qualidade ou atributo ausente/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/comprar|subir|adquirir/i})).not.toBeInTheDocument();
 });
 it('deriva somente dados com todas as dependências, nunca inventa Movimento/Corrida',()=>{
  const result=buildCharacterPlayerPreview(record,'erdenor')!;
  expect(result.stats.find(x=>x.key==='intrigueDefense')).toMatchObject({value:11});
  expect(result.stats.find(x=>x.key==='maxComposure')).toMatchObject({value:9});
  expect(result.stats.find(x=>x.key==='movement')).toMatchObject({value:null});
  expect(result.stats.find(x=>x.key==='running')).toMatchObject({value:null});
 });
 it('não transforma fotos ou documentos da corte em fichas publicadas',()=>{
  expect(buildCharacterPlayerPreview({...record,title:'Aldaeric Erdenor',
   content:'Cargo: Lorde da Casa\n[cormyr-image:path]'},'erdenor')).toBeNull();
  expect(buildCharacterPlayerPreview({...record,kind:'details'},'erdenor')).toBeNull();
 });
 it('exibe ficha estruturada sem editar ou aprovar efeitos narrativos',()=>{
  const v1=blankChronicleSheet();v1.name='Rowena Grantass';v1.cunning=4;
  const current={...record,content:serializeChronicleSheet(v1),title:'Personagem V1'};
  const preview=buildCharacterPlayerPreview(current,'grantass')!;
  expect(preview.known.size).toBe(19);
  expect(preview.character.review.status).toBe('needs_review');
  expect(preview.character.traits).toHaveLength(0);
 });
});
