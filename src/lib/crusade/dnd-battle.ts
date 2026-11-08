import {crzBuildCatalog} from './catalog';
import type {CrzCreature} from './creatures';
import {crzScenario} from './geometry';
import {crzPreset,crzRulesetHash} from './ruleset';
import {crzPrepareBattle,type CrzReady} from './setup';
import {crzPcg32} from './rng';
import type {CrzTrainingOptions} from './training-demo';
import {sharedToCrzMap} from '@/lib/battle/geometry/shared-square-map';
import {DND_MILITARY_CREATURES,dndMilitaryTemplateId} from './dnd-military';

export type DndStackDraft=Readonly<{
 id:string;side:'attacker'|'defender';templateId:string;
 count:number;training:'green'|'trained'|'veteran'|'elite';
}>;
export const DND_DEFAULT_STACKS:readonly DndStackDraft[]=[
 {id:'army-infantry',side:'attacker',templateId:dndMilitaryTemplateId('infantry'),count:12,training:'trained'},
 {id:'army-archers',side:'attacker',templateId:dndMilitaryTemplateId('archers'),count:8,training:'trained'},
 {id:'enemy-raiders',side:'defender',templateId:dndMilitaryTemplateId('raiders'),count:12,training:'trained'},
 {id:'enemy-garrison',side:'defender',templateId:dndMilitaryTemplateId('garrison'),count:8,training:'trained'},
];

/** Não lê nem converte uma Casa oficial. Usa apenas perfis D&D curados
 * e monstros trazidos pelo usuário. A simulação inteira é local e reexecutável.
 */
export function dndBattleReady(options:CrzTrainingOptions,
 drafts:readonly DndStackDraft[],imported:readonly CrzCreature[]=[]):CrzReady{
 if(drafts.length<2||drafts.length>14)
  throw new Error('D&D: escolha de 2 a 14 pilhas.');
 for(const side of ['attacker','defender'] as const)
  if(!drafts.some(d=>d.side===side)||drafts.filter(d=>d.side===side).length>7)
   throw new Error('D&D: cada exército precisa ter de 1 a 7 pilhas.');
 const catalog=crzBuildCatalog([...DND_MILITARY_CREATURES,...imported]);
 const templates=new Set(catalog.templates.map(t=>t.id));
 const seen=new Set<string>();
 for(const draft of drafts){
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(draft.id)||seen.has(draft.id))
   throw new Error('D&D: identificador de pilha duplicado ou inválido.');
  seen.add(draft.id);
  if(!templates.has(draft.templateId))throw new Error('D&D: perfil desconhecido: '+draft.templateId);
  if(!Number.isSafeInteger(draft.count)||draft.count<1||draft.count>1000)
   throw new Error('D&D: quantidade de criaturas inválida.');
 }
 const rules=crzPreset('CRZ-5E','square');
 const input={
  id:'dnd-training-'+options.seed.toLowerCase(),
  name:'D&D · Batalha tática de criaturas e exércitos',
  seed:options.seed,rulesetId:'CRZ-5E' as const,
  rulesetHash:crzRulesetHash(rules),
  resolution:options.resolution,
  map:options.sharedMap?sharedToCrzMap(options.sharedMap):
   crzScenario(options.scenario,options.width,'square'),
  armies:{
   attacker:{side:'attacker' as const,name:'Exército atacante',
    stacks:drafts.filter(d=>d.side==='attacker').map(d=>({
     id:d.id,templateId:d.templateId,count:d.count,training:d.training,
     source:(d.templateId.endsWith('|user')||d.templateId.endsWith('|local'))?
      {kind:'monster-library' as const,catalogHash:catalog.catalogHash}:
      {kind:'fictional' as const},
    }))},
   defender:{side:'defender' as const,name:'Exército defensor',
    stacks:drafts.filter(d=>d.side==='defender').map(d=>({
     id:d.id,templateId:d.templateId,count:d.count,training:d.training,
     source:(d.templateId.endsWith('|user')||d.templateId.endsWith('|local'))?
      {kind:'monster-library' as const,catalogHash:catalog.catalogHash}:
      {kind:'fictional' as const},
    }))},
  },
  controls:{attacker:'human' as const,defender:options.opponent},
  leaders:{attacker:null,defender:null},
 };
 const ready=crzPrepareBattle(input,catalog);
 // D&D: iniciativa UMA vez no início do encontro, d20 + modificador de
 // Destreza + treinamento. Não somar 2×movimento como na Cruzada CRZ.
 // O estado do RNG depois das rolagens segue nos dados do replay.
 const rng=crzPcg32(ready.rngState);
 const stacks=ready.stacks.map(stack=>({
  ...stack,
  initiative:rng.nextInt(20)+1+stack.template.abilityMods.dex+
   ready.ruleset.training[stack.training].initiative,
 }));
 // Manter o estado inicial do RNG do motor: crzStart verifica que ele
 // corresponde exatamente à seed original. A iniciativa é determinística
 // e persistida em stacks/replay, mas não consome esse fluxo de combate.
 return {...ready,stacks,
  warnings:[...ready.warnings,'Iniciativa D&D: d20 + DES + treino, uma vez por encontro; perfis militares são traduções digitais originais.']};
}
