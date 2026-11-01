import {describe,it,expect} from 'vitest';
import {classifyCharacterV2Source,summarizeCharacterV2Sources} from '@/lib/character-v2/readiness';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';
import {CHARACTER_V2_RELEASE_GATE,assertCharacterV2ReleaseAuthorized} from '@/lib/character-v2/migration-review';

const id='00000000-0000-4000-8000-000000000777';
const legacy=[
 'Página1 "Ficha de personagem GOT" · · ·',
 '"Nome do Personagem" · "Aldaeric Erdenor"',
 'Graduação · Habilidade · Especialização · Intriga · Movimento',
 '2 · Agilidade · · 0',
 '4 · Astucia · "Lógica (2)" · 40',
 '3 · Atletismo ·',
 '3 · Percepção ·',
 '4 · Status ·',
].join('\n');
const rows=(texts:string[])=>texts.map((content,i)=>({
 id:i.toString(),title:i<6?'Ficha - Lorde':'Aldaeric / retrato',
 kind:'character',content,
}));
describe('Publicação segura da Ficha V2 — inventário e portas de migração',()=>{
 it('inclui somente fichas reconhecidas, não fotos ou integrantes da corte',()=>{
  const recognized=classifyCharacterV2Source({
   id,title:'Ficha - Lorde',kind:'character',content:legacy,
  });
  expect(recognized).toMatchObject({kind:'legacy',inspectable:true,recognizedSkills:5});
  expect(classifyCharacterV2Source({id,title:'Aldaeric',kind:'character',
   content:'Cargo: Lorde da Casa\n[cormyr-image:abc]'})).toMatchObject({
   kind:'unrelated',inspectable:false,
  });
  expect(classifyCharacterV2Source({id,title:'Ficha - Lorde',kind:'character',
   content:'Nome do Personagem · Lorde sem tabela'})).toMatchObject({
   kind:'incomplete',inspectable:false,
  });
  expect(classifyCharacterV2Source({id,title:'Imagem',kind:'document',
   content:legacy}).inspectable).toBe(false);
 });
 it('relata de forma honesta registros classificados, sem tratá-los como fichas completas',()=>{
  const all=rows([...Array.from({length:6},()=>legacy),
   ...Array.from({length:13},()=> '[cormyr-image:private]')]);
  const report=summarizeCharacterV2Sources(all);
  expect(report).toMatchObject({total:19,inspectable:6,structured:0,
   legacy:6,excluded:13,incomplete:0});
  expect(report.classified.filter(x=>x.inspectable)).toHaveLength(6);
 });
 it('detecta habilidades ausentes ou duplicadas sem convertê-las em aquisições',()=>{
  const record={id,houseId:'erdenor',title:'Ficha - Lorde',version:1,
   content:legacy+'\n4 · Astucia · Lógica (2)'};
  const result=readCharacterV2(record);
  expect(result.character?.skillRanks.cunning).toBe(4);
  expect(result.character?.skillRanks.agility).toBe(2);
  expect(result.character?.skillRanks.endurance).toBe(2);
  expect(result.character?.source.unparsedFields['missingSkills']).toContain('Vigor');
  expect(result.warnings.some(x=>x.includes('duplicada'))).toBe(true);
  expect(result.warnings.some(x=>x.includes('provisório'))).toBe(true);
  expect(result.character?.source.originalContent).toBe(record.content);
 });
 it('não confunde ficha V1 válida com mero retrato da Casa',()=>{
  const v1=blankChronicleSheet();v1.name='Aldaeric Erdenor';
  const result=classifyCharacterV2Source({id,title:'Registro completo',
   kind:'character',content:serializeChronicleSheet(v1)});
  expect(result).toMatchObject({kind:'structured',inspectable:true,recognizedSkills:19});
 });
 it('não libera jogadores mesmo se a prévia tiver sido produzida',()=>{
  expect(CHARACTER_V2_RELEASE_GATE).toBe(false);
  expect(()=>assertCharacterV2ReleaseAuthorized()).toThrow('bloqueada');
 });
});
