import {describe,expect,it} from 'vitest';
import {UNIT_TYPES} from '@/lib/house/engine';
import {DND_MILITARY_MAPPING,DND_MILITARY_CREATURES,
 dndMilitaryTemplateId,DND_MILITARY_CONVERSION_VERSION} from '@/lib/crusade/dnd-military';
import {DND_MONSTER_CSV_EXAMPLE,parseDndMonsterTable}
 from '@/lib/crusade/dnd-import';
import {DND_DEFAULT_STACKS,dndBattleReady}
 from '@/lib/crusade/dnd-battle';
import {CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import {crzReplayBegin,crzVerifyReplay} from '@/lib/crusade/replay';
import {crzLegalCommands} from '@/lib/crusade/turns';
import {crzBuildCatalog} from '@/lib/crusade/catalog';

const options={...CRZ_TRAINING_DEFAULTS,seed:'deaf2026',resolution:'rolled' as const};

describe('D&D simplificado: de/para 17 tipos, não converte o livro GOT',()=>{
 it('tem exatamente 17 tipos, IDs iguais ao livro do Cormyr, sem dados duplicados',()=>{
  expect(DND_MILITARY_CONVERSION_VERSION).toBe('CCA-DND-17-1');
  expect(DND_MILITARY_MAPPING).toHaveLength(17);
  expect(new Set(DND_MILITARY_MAPPING.map(u=>u.typeId)).size).toBe(17);
  expect(DND_MILITARY_MAPPING.map(u=>u.typeId).sort()).toEqual(
   UNIT_TYPES.map(x=>x.id).sort());
  expect(DND_MILITARY_CREATURES).toHaveLength(16);
  expect(DND_MILITARY_MAPPING.find(x=>x.typeId==='warships')?.unavailableReason)
   .toMatch(/naval|Navios/);
  expect(DND_MILITARY_CREATURES.find(x=>x.id===dndMilitaryTemplateId('warships')))
   .toBeUndefined();
  expect(DND_MILITARY_MAPPING.find(x=>x.typeId==='cavalry')?.individualsPerOriginalUnit).toBe(20);
  expect(DND_MILITARY_MAPPING.find(x=>x.typeId==='warships')?.individualsPerOriginalUnit).toBe(5);
  expect(DND_MILITARY_MAPPING.find(x=>x.typeId==='special')?.requiresNarratorReview).toBe(true);
 });
 it('cada unidade militar terrestre tem atributos, alcance e licença explícitos',()=>{
  for(const template of DND_MILITARY_CREATURES){
   expect(template.hp.average).toBeGreaterThan(0);
   expect(template.ac).toBeGreaterThan(0);
   expect(template.speedFt.walk).toBeGreaterThan(0);
   expect(template.attacks.some(a=>a.kind==='melee')).toBe(true);
   expect(template.provenance.license).toBe('original-authorized');
   expect(template.provenance.srd).toBe(false);
   expect(template.warnings.join(' ')).toMatch(/Conversão D&D digital/);
  }
  const archer=DND_MILITARY_CREATURES.find(x=>x.id===dndMilitaryTemplateId('archers'))!;
  expect(archer.attacks.some(a=>a.kind==='ranged')).toBe(true);
  expect(archer.attacks.find(a=>a.kind==='ranged')?.rangeFt?.normal).toBe(150);
 });
});

describe('D&D: importação de tabela de monstros com origem validada',()=>{
 it('importa CSV separado por ponto-e-vírgula e conserva quantidade inicial',()=>{
  const imported=parseDndMonsterTable(DND_MONSTER_CSV_EXAMPLE);
  expect(imported.creatures).toHaveLength(1);
  const wolf=imported.creatures[0]!;
  expect(wolf.id).toBe('monster-wolf-test|user');
  expect(wolf.hp.average).toBe(11);
  expect(wolf.ac).toBe(13);
  expect(wolf.abilityMods.dex).toBe(2);
  expect(wolf.attacks[0]).toMatchObject({kind:'melee',toHit:4});
  expect(imported.recommendedStacks).toEqual([{templateId:wolf.id,side:'defender',count:6}]);
  expect(crzBuildCatalog([...DND_MILITARY_CREATURES,...imported.creatures]).templates)
   .toHaveLength(17);
 });
 it('importa JSON de monstros com o mesmo validador e sem scripts executáveis',()=>{
  const [head,row]=DND_MONSTER_CSV_EXAMPLE.split('\n');
  const fields=head!.split(';');
  const values=row!.split(';');
  const sample=Object.fromEntries(fields.map((field,i)=>[field,values[i]]));
  const creatures=parseDndMonsterTable(JSON.stringify({monsters:[sample]}));
  expect(creatures.creatures[0]!.provenance.contentHash).toMatch(/^[a-f0-9]{64}$/);
 });
 it('recusa origem sem permissão, id repetido, planilhas inválidas e excesso de registros',()=>{
  expect(()=>parseDndMonsterTable(DND_MONSTER_CSV_EXAMPLE.replace(
   'Autorização do próprio criador para uso privado no simulador','')))
   .toThrow(/permissionEvidence|comprovação|Comprova|obrigatório/);
  const [head,row]=DND_MONSTER_CSV_EXAMPLE.split('\n');
  expect(()=>parseDndMonsterTable([head,row,row].join('\n')))
   .toThrow(/duplicado/);
  expect(()=>parseDndMonsterTable('id;name\nxxx;sem dados')).toThrow(/coluna obrigatória/);
  expect(()=>parseDndMonsterTable('[{"id":"x"}]')).toThrow(/linha 2/);
  expect(()=>parseDndMonsterTable('x'.repeat(1_000_001))).toThrow(/1 MB/);
 });
 it('não aceita conversões incompletas de ações especiais como ataques básicos fictícios',()=>{
  const wrong=DND_MONSTER_CSV_EXAMPLE.replace('+4;2d4+2',';');
  expect(()=>parseDndMonsterTable(wrong)).toThrow();
 });
});

describe('D&D: pilhas, iniciativa d20, combate e replay verificável',()=>{
 it('monta batalha quadrada com d20, PV/CA/alcance e quantidade variável',()=>{
  const ready=dndBattleReady(options,DND_DEFAULT_STACKS);
  expect(ready.rulesetId).toBe('CRZ-5E');
  expect(ready.map.grid).toBe('square');
  expect(ready.resolution).toBe('rolled');
  expect(ready.stacks).toHaveLength(4);
  const infantry=ready.stacks.find(x=>x.templateId===dndMilitaryTemplateId('infantry'))!;
  expect(infantry.hpPool).toBe(infantry.hpPerCreature*infantry.initialCount);
  expect(infantry.template.ac).toBe(15);
  expect(infantry.meleeRoutine).not.toBeNull();
  expect(ready.stacks.find(x=>x.templateId===dndMilitaryTemplateId('archers'))?.rangedRoutine)
   .not.toBeNull();
  for(const stack of ready.stacks){
   const bonus=stack.template.abilityMods.dex+ready.ruleset.training[stack.training].initiative;
   expect(stack.initiative-bonus).toBeGreaterThanOrEqual(1);
   expect(stack.initiative-bonus).toBeLessThanOrEqual(20);
  }
  expect(dndBattleReady(options,DND_DEFAULT_STACKS).stacks).toEqual(ready.stacks);
  const session=crzReplayBegin(ready);
  expect(session.state.stacks.every(s=>s.hpPool>0)).toBe(true);
  expect(crzVerifyReplay(session.replay).ok).toBe(true);
  expect(crzLegalCommands(session.state).length).toBeGreaterThan(0);
 });
 it('importa monstros licenciados para pilhas com quantidades e ataque a distância',()=>{
  const [header,values]=DND_MONSTER_CSV_EXAMPLE.split('\n');
  const updated=values!.replace(';;;;6;defender',';+4;1d6+1;80;6;defender');
  const data=parseDndMonsterTable([header,updated].join('\n'));
  const stacks=[
   {id:'first',side:'attacker' as const,
    templateId:dndMilitaryTemplateId('infantry'),count:5,training:'trained' as const},
   {id:'monster',side:'defender' as const,
    templateId:data.creatures[0]!.id,count:6,training:'trained' as const},
  ];
  const ready=dndBattleReady(options,stacks,data.creatures);
  const enemy=ready.stacks.find(x=>x.id==='monster')!;
  expect(enemy.initialCount).toBe(6);
  expect(enemy.source.kind).toBe('monster-library');
  expect(enemy.rangedRoutine).not.toBeNull();
  expect(enemy.rangeHex).toBeGreaterThan(1);
  expect(crzVerifyReplay(crzReplayBegin(ready).replay).ok).toBe(true);
 });
 it('protege limite de 7 pilhas por lado, tipos desconhecidos e IDs duplicados',()=>{
  expect(()=>dndBattleReady(options,[
   {...DND_DEFAULT_STACKS[0]!,templateId:dndMilitaryTemplateId('warships')},
   ...DND_DEFAULT_STACKS.slice(1)])).toThrow(/desconhecido/);
  expect(()=>dndBattleReady(options,[
   {...DND_DEFAULT_STACKS[0]!,count:0},...DND_DEFAULT_STACKS.slice(1)]))
   .toThrow(/quantidade/);
  expect(()=>dndBattleReady(options,[
   DND_DEFAULT_STACKS[0]!,{...DND_DEFAULT_STACKS[1]!,id:DND_DEFAULT_STACKS[0]!.id},
   ...DND_DEFAULT_STACKS.slice(2)])).toThrow(/duplicado/);
  const eight=Array.from({length:8},(_,i)=>({
   ...DND_DEFAULT_STACKS[0]!,id:'attacker-'+i}));
  expect(()=>dndBattleReady(options,[...eight,DND_DEFAULT_STACKS[2]!]))
   .toThrow(/1 a 7/);
 });
});
