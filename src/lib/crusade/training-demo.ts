/** CRZ-1.0 · Lote 6 — catálogo ORIGINAL de exércitos-modelo para treino.
 * Nenhum vínculo com HouseState, unidades oficiais, Supabase ou o motor PTE.
 */
import {crzSealCreature} from './creatures';
import {crzBuildCatalog} from './catalog';
import {crzScenario,type CrzScenarioId} from './geometry';
import {crzPreset,crzRulesetHash,type CrzPresetId} from './ruleset';
import {crzPrepareBattle,type CrzReady} from './setup';

export const CRZ_TRAINING_SCENARIOS:readonly Readonly<{
 id:CrzScenarioId;name:string;
}>[]=[
 {id:'plain-open',name:'Planície das Terras da Coroa'},
 {id:'contested-woods',name:'Bosques de fronteira'},
 {id:'border-hills',name:'Colinas de Cormyr'},
 {id:'narrow-passage',name:'Passagem fortificada'},
];

export type CrzTrainingOptions=Readonly<{
 scenario:CrzScenarioId;
 preset?:CrzPresetId;
 generalLevel?:number;
 width:11|15;
 resolution:'expected'|'hybrid';
 opponent:'ai'|'human';
 seed:string;
}>;

export const CRZ_TRAINING_DEFAULTS:CrzTrainingOptions={
 scenario:'plain-open',width:11,resolution:'expected',
 opponent:'ai',seed:'c0ffee52',
};

function sampleCreature(args:{
 id:string;name:string;hp:number;ac:number;dex:number;
 xp:number;attack:number;weaponDice:string;weaponMod:number;
 bow?:boolean;charge?:boolean;nimble?:boolean;
}){
 const {id,name,hp,ac,dex,xp,attack,weaponDice,weaponMod,bow,charge,nimble}=args;
 return crzSealCreature({
  schemaVersion:1,id:id+'|original',name,
  source:'Laboratório fictício CRZ-1.0',size:'M',
  creatureType:'humanoid',tags:['synthetic','training'],
  cr:0.25,xp,proficiencyBonus:2,
  abilityMods:{str:2,dex,con:1,int:0,wis:0,cha:0},
  hp:{average:hp},ac,speedFt:{walk:30},
  attacks:[
   {id:'blade',name:'Arma de treinamento',kind:'melee',toHit:attack,
    reachFt:5,damage:[{dice:weaponDice,mod:weaponMod,
     avg:5,type:'slashing'}]},
   ...(bow?[{id:'bow',name:'Arco de treinamento',kind:'ranged',
    toHit:attack,rangeFt:{normal:80,long:320},
    damage:[{dice:'1d8',mod:2,avg:6,type:'piercing'}]}]:[]),
  ],
  multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[...(charge?['charge']:[]),...(nimble?['nimble-escape']:[])],
  flags:{flying:false,ranged:Boolean(bow),caster:false,
   legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Ficha original e fictícia do laboratório Cormyr.',
   permissionEvidence:'Criada exclusivamente como unidade fictícia de demonstração.'},
  warnings:[],
 });
}

export const CRZ_TRAINING_CATALOG=crzBuildCatalog([
 sampleCreature({id:'guard-cca',name:'Guarda da Coroa',
  hp:12,ac:15,dex:1,xp:75,attack:4,weaponDice:'1d8',weaponMod:2}),
 sampleCreature({id:'archer-cca',name:'Arqueiro Tillet',
  hp:9,ac:13,dex:2,xp:50,attack:4,weaponDice:'1d4',weaponMod:1,bow:true}),
 sampleCreature({id:'raider-cca',name:'Vanguarda Ashkar',
  hp:12,ac:14,dex:2,xp:75,attack:5,weaponDice:'1d8',weaponMod:3,charge:true}),
 sampleCreature({id:'scout-cca',name:'Batedor da Costa',
  hp:9,ac:13,dex:3,xp:50,attack:4,weaponDice:'1d6',weaponMod:2,bow:true,nimble:true}),
]);

const unit=(id:string,templateId:string,count:number)=>({
 id,templateId:templateId+'|original',count,
 training:'trained' as const,source:{kind:'fictional' as const},
});

/** Uma batalha reproduzível por seed explícita e sem leitura do servidor. */
export function crzTrainingReady(options:CrzTrainingOptions):CrzReady{
 const preset=options.preset??'CRZ-5E';
 const rules=crzPreset(preset);
 if(preset!=='CRZ-5E'&&options.resolution!=='expected')
  throw new Error('WOTR e PTE-compat exigem resolução expected.');
 const generalLevel=options.generalLevel??3;
 if(!Number.isInteger(generalLevel)||generalLevel<1||generalLevel>10)
  throw new Error('Nível de General fora do limite de treinamento.');
 return crzPrepareBattle({
  id:'crz-training-'+options.seed.toLowerCase(),
  name:'Treinamento da Cruzada · Cormyr',
  seed:options.seed,rulesetId:preset,
  rulesetHash:crzRulesetHash(rules),
  resolution:options.resolution,
  map:crzScenario(options.scenario,options.width),
  armies:{
   attacker:{side:'attacker',name:'Defensores da Coroa',stacks:[
    unit('guard-a','guard-cca',14),
    unit('archer-a','archer-cca',10),
    unit('guard-b','guard-cca',8),
   ]},
   defender:{side:'defender',name:'Forças fictícias de Ashkar',stacks:[
    unit('raider-d','raider-cca',13),
    unit('scout-d','scout-cca',11),
    unit('raider-e','raider-cca',8),
   ]},
  },
  controls:{attacker:'human',defender:options.opponent},
  leaders:{
   attacker:{id:'tillet-general',name:'General Tillet (modelo)',
    level:generalLevel,abilityMod:2,
    spells:['bless','shield_of_faith','cure_wounds','firebolt',
     'shield_wall_formation','fireball']},
   defender:{id:'ashkar-general',name:'Oficial Ashkar (modelo)',
    level:3,abilityMod:1,spells:['bane','cause_fear']},
  },
 },CRZ_TRAINING_CATALOG);
}
