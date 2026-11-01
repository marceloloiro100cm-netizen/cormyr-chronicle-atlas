import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {readLegacyTraitColumns,readStructuredTraitText,importTraitSelections}
 from '@/lib/character-v2/legacy-traits';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {buildCharacterPlayerPreview,CharacterV2PlayerSheet}
 from '@/components/character-v2/player-sheet';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';

const ID='00000000-0000-4000-8000-000000000771';
const record=(body:string)=>({id:ID,kind:'character',title:'Ficha - Lorde',
 content:body,version:1,houseId:'erdenor'});
const base=['Página1 "Ficha de personagem GOT" · · ·',
 '"Nome do Personagem" · "Aldaeric Erdenor"',
 'Graduação · Habilidade · Especialização',
 '2 · Agilidade ·',
 '4 · Astucia · Lógica (2)',
 '3 · Percepção ·',
 '4 · Status ·',
 '3 · Vontade ·'].join('\n');
const withTraits=(...rows:string[])=>[base,
 'Qualidades · · Defeitos · · · -4D · · -4D · · XP Total investido',
 ...rows].join('\n');

describe('Importação segura de Qualidades e Defeitos das fichas GOT',()=>{
 it('lê as colunas 0 e 2 da planilha Erdenor sem interpretar XP e -D como traços',()=>{
  const data=withTraits('Patrono · · Mudo · · · -5D · · -5D',
   'Carismático · · · · · -6D · · -6D',
   ' · · · · · -7D');
  const traits=readLegacyTraitColumns(data);
  expect(traits.map(x=>[x.kind,x.original,x.catalogTrait?.id])).toEqual([
   ['quality','Patrono','patrono'],['flaw','Mudo','mudo'],
   ['quality','Carismático','carismatico'],
  ]);
  const imported=readCharacterV2(record(data));
  expect(imported.character?.traits).toHaveLength(3);
  expect(imported.character?.traits.every(t=>t.status==='imported_unverified')).toBe(true);
  expect(imported.character?.review.status).toBe('needs_review');
  expect(imported.character?.source.originalContent).toBe(data);
 });
 it('interpreta variantes entre parênteses, mas mantém condições não homologadas',()=>{
  const data=withTraits(
   'Abastado · · Amaldiçoado · ·',
   'Autoridade · · "Defeito (Pontaria)" · ·',
   'Enorme · · "Medo (Prata)" · ·',
   '"Favorito da Nobreza" · · · ·',
   'Herança · · · ·',
   'Traiçoeiro · · · ·');
  const traits=readLegacyTraitColumns(data);
  expect(traits.filter(x=>x.kind==='quality')).toHaveLength(6);
  const defect=traits.find(x=>x.original==='Defeito (Pontaria)');
  expect(defect?.catalogTrait?.id).toBe('defeito-habilidade-parametrizada');
  expect(defect?.skillId).toBe('marksmanship');
  expect(traits.find(x=>x.original==='Medo (Prata)')?.detail).toBe('Prata');
  expect(importTraitSelections(traits).some(t=>t.status!=='imported_unverified')).toBe(false);
 });
 it('preserva detalhamentos de Grantass e não confunde notas de XP com Defeitos',()=>{
  const traits=readLegacyTraitColumns(withTraits(
   '"Foco em conhecimento: Alquimia" · · "Inimigo" · ·',
   '"Herança: Cajado de Magi" · · "1 Atletismo (Sedentária)" · ·',
   'Meistre · · "1 Luta (Inepta)" · ·',
   '"Mente Matemática" · · "1 Pontaria (Trêmula)" · ·',
   '"Foco em conhecimento: Magia" · · "1 Ladinagem (Tola)" · ·',
   'Milagreiro · · "1 Furtividade (Óbvia)" · ·',
   ' · · "Frágil (Atletismo, Luta e Pontaria)" · · "*+1D em Astucia e Conhecimento"',
   ' · · Assombrada · ·'));
  expect(traits).toHaveLength(14);
  expect(traits.find(t=>t.original==='Herança: Cajado de Magi')?.catalogTrait?.id).toBe('heranca');
  expect(traits.find(t=>t.original==='Foco em conhecimento: Alquimia')?.detail).toBe('Alquimia');
  expect(traits.find(t=>t.original==='1 Atletismo (Sedentária)')?.skillId).toBe('athletics');
  expect(traits.find(t=>t.original==='1 Luta (Inepta)')?.catalogTrait?.id).toBe('defeito-habilidade-parametrizada');
  expect(traits.find(t=>t.original==='Assombrada')?.catalogTrait?.id).toBe('assombrado');
 });
 it('lê ficha estruturada com múltiplas qualidades sem fracionar vírgulas de parâmetro',()=>{
  const qualities='Patrono; Carismático; Foco em Conhecimento: Alquimia';
  const flaws='Medo (Ameaça Obscura)\nFrágil (Atletismo, Luta e Pontaria)';
  const traits=readStructuredTraitText(qualities,flaws);
  expect(traits).toHaveLength(5);
  const source=blankChronicleSheet();source.name='Aldaeric Erdenor';
  source.qualities=qualities;source.flaws=flaws;
  const parsed=readCharacterV2(record(serializeChronicleSheet(source)));
  expect(parsed.character?.traits).toHaveLength(5);
  expect(parsed.character?.traits.find(t=>t.params['original']==='Frágil (Atletismo, Luta e Pontaria)')).toBeDefined();
 });
 it('a ficha nova mostra Qualidades e Defeitos separados, sem aplicar bônus não confirmados',()=>{
  const data=withTraits('Patrono · · Mudo · ·','Carismático · · · ·');
  const preview=buildCharacterPlayerPreview(record(data),'erdenor');
  expect(preview?.traitNotes).toHaveLength(3);
  render(<CharacterV2PlayerSheet record={record(data)} houseId="erdenor"/>);
  expect(screen.getByRole('region',{name:'Qualidades e defeitos da ficha'})).toBeInTheDocument();
  expect(screen.getByRole('article',{name:'Patrono — Benefício'})).toBeInTheDocument();
  expect(screen.getByRole('article',{name:'Mudo — Desvantagem'})).toBeInTheDocument();
  expect(screen.getByRole('article',{name:'Carismático — Benefício'})).toBeInTheDocument();
  expect(screen.getAllByText(/Importado — pendente de conciliação/)).toHaveLength(3);
  expect(screen.getByText(/bônus bloqueado até homologação do Narrador/)).toBeInTheDocument();
  expect(preview?.character.traits.every(t=>t.status==='imported_unverified')).toBe(true);
 });
});
