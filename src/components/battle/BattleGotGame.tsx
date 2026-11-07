import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {createWarBattle,issueWarOrder,issueWarPincer,advanceWarRound,warUnitSummary,previewWarMovement,fireWarSiegeVolley,skipWarSiege,completeWarHeroPhase,executeWarHeroAttackUnit} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {beginPersonalInitiative,personalTurnHeroId,delayPersonalTurn} from '@/lib/battle/got/personal-initiative';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {applyWarFate,restoreSpentFate,fateAvailable} from '@/lib/battle/got/personal-fate';
import type {WarFateAction} from '@/lib/battle/got/personal-fate';
import {resolveLabRecovery,restoreOrdinaryDamageAfterBattle} from '@/lib/battle/got/personal-recovery';
import type {RecoveryActivity,RecoveryInterval} from '@/lib/battle/got/personal-recovery';
import {deployWarSquad} from '@/lib/battle/got/squads';
import {equipModelWarHero,equipModelWarOffhand,WAR_PERSONAL_WEAPONS} from '@/lib/battle/got/personal-weapons';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import type {WarPersonalWeaponId} from '@/lib/battle/got/personal-weapons';
import type {PersonalMitigationChoice} from '@/lib/battle/got/personal-injuries';
import type {WarHeroAction} from '@/lib/battle/got/heroes';
import {makeWarFortification,WAR_FORT_PROFILES} from '@/lib/battle/got/fortifications';
import type {WarFortKind} from '@/lib/battle/got/fortifications';
import {makeModelSiege,WAR_SIEGE_CATALOG} from '@/lib/battle/got/siege';
import type {WarSiegeKind,WarSiegeAmmo} from '@/lib/battle/got/siege';
import {modelWarUnit,modelWarCommanders,WAR_MODEL_UNIT_TYPES} from '@/lib/battle/got/models';
import type {WarModelUnitTypeId} from '@/lib/battle/got/models';
import {modelWarLabDeployments} from '@/lib/battle/got/lab-deployment';
import {positionedWarLabDeployments,positionWarLabUnit} from '@/lib/battle/got/lab-positioning';
import {encodeGotLabSave,decodeGotLabSave,GOT_LAB_SAVE_KEY} from '@/lib/battle/got/lab-save';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';
import {WAR_FIELD_EQUIPMENT} from '@/lib/battle/got/field-equipment';
import type {WarFieldEquipmentId} from '@/lib/battle/got/field-equipment';
import type {WarResourceScenario} from '@/lib/battle/got/aftermath-resources';
import type {WarBattle,WarOrder,WarOrderKind,WarUnit,WarSide,WarPosition} from '@/lib/battle/got/types';
import type {WarWeather,WarVisibility,WarTerrainId,WarTerrainTile} from '@/lib/battle/got/terrain';
import {WAR_TERRAIN,terrainAt,terrainEffect,terrainCoverBonus,terrainMoveCost,visibilityPenalty} from '@/lib/battle/got/terrain';
import type {WarFormation,WarFacing} from '@/lib/battle/got/formations';
import {WAR_FORMATIONS} from '@/lib/battle/got/formations';
import {BattleGotSourcePicker} from './BattleGotSourcePicker';
import type {Slot} from './BattleGotSourcePicker';
import './battle-got.css';

type TypeId=WarModelUnitTypeId;
const OPTIONS:readonly {id:TypeId;label:string}[]=WAR_MODEL_UNIT_TYPES;
const SIDE:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
const ORDER_LABEL:Record<WarOrderKind,string>={
 attack:'Atacar',charge:'Carga',defend:'Defender',move:'Mover',ready:'Prontidão',
 rally:'Reagrupar',revive:'Reanimar',reorganize:'Reorganizar',
 retreat:'Retirada', 'aggressive-retreat':'Retirada agressiva',surrender:'Rendição geral',
 formation:'Alterar formação',turn:'Girar',reverse:'Reverter',
 suppress:'Fogo de supressão',probe:'Ataque exploratório',push:'Empurrar',
 'counter-charge':'Preparar contra carga',sabotage:'Sabotagem',
 ambush:'Emboscada',join:'Junção de unidades',
 'split-attack':'Ataque Dividido (unidades)',
 'lightning-attack':'Ataque Relâmpago',
 trample:'Atropelar (cavalaria)',
 envelop:'Envolver',
 'scorched-earth':'Terra Arrasada (prévia)',
 pincer:'Pinça · dois aliados (+3)',
 'hammer-anvil':'Martelo & Bigorna · prontidão (+6)',
 'climb-walls':'Escalar Muralhas (+3)',
 'fire-special':'Disparar munição especial (uso único)',
 'breach-gate':'Arrombar portão com aríete',
 'discard-equipment':'Abandonar equipamento especial',
};
const CONDITION:Record<WarUnit['condition'],string>={
 organized:'Organizada',disorganized:'Desorganizada',routed:'Debandada',
 destroyed:'Destruída',surrendered:'Rendida',escaped:'Fora de campo',
};
export function BattleGotGame({onBack}:{onBack:()=>void}){
 const [battle,setBattle]=useState<WarBattle|null>(null);
 const [seed,setSeed]=useState('guerra-cormyr-livro');
 const [name,setName]=useState('Escaramuça de treinamento');
 const [warfare,setWarfare]=useState({attacker:3,defender:3});
 const [types,setTypes]=useState<Record<string,TypeId>>({
  'attacker-1':'infantry','attacker-2':'archers',
  'defender-1':'infantry','defender-2':'archers',
 });
 const [training,setTraining]=useState<WarUnit['training']>('trained');
 const [extraUnitsPerSide,setExtraUnitsPerSide]=useState(0);
 const [deploymentPositions,setDeploymentPositions]=useState<Readonly<Record<string,WarPosition>>>({});
 const [deploymentMode,setDeploymentMode]=useState<'paint'|'deploy'>('paint');
 const [deploymentSelected,setDeploymentSelected]=useState('attacker-1');
 const [localSaveStatus,setLocalSaveStatus]=useState('');
 const [weather,setWeather]=useState<WarWeather>('clear');
 const [visibility,setVisibility]=useState<WarVisibility>('clear');
 const [advanced,setAdvanced]=useState(false);
 const [strictSightline,setStrictSightline]=useState(false);
 const [hiddenModelSide,setHiddenModelSide]=useState<'none'|WarSide>('none');
 const [tiles,setTiles]=useState<WarTerrainTile[]>([]);
 const [terrainPaint,setTerrainPaint]=useState<WarTerrainId>('plain');
 const [formation,setFormation]=useState<WarFormation>('battle');
 const [facing,setFacing]=useState<WarFacing>('north');
 const [siegeEnabled,setSiegeEnabled]=useState(false);
 const [modelFieldEquipment,setModelFieldEquipment]=useState<'none'|WarFieldEquipmentId>('none');
 const [heroesEnabled,setHeroesEnabled]=useState(false);
 const [modelMelee,setModelMelee]=useState<WarPersonalWeaponId>('longsword');
 const [modelRanged,setModelRanged]=useState<WarPersonalWeaponId>('longbow');
 const [modelOffhand,setModelOffhand]=useState<'none'|WarPersonalWeaponId>('none');
 const [modelOneHandUnavailable,setModelOneHandUnavailable]=useState(false);
 const [modelHealingRank,setModelHealingRank]=useState(3);
 const [modelMountEnabled,setModelMountEnabled]=useState(false);
 const [modelStrengthBonus,setModelStrengthBonus]=useState(2);
 const [manualMitigation,setManualMitigation]=useState(false);
 const [mitigationKind,setMitigationKind]=useState<PersonalMitigationChoice['kind']>('none');
 const [mitigationWounds,setMitigationWounds]=useState(1);
 const [heroId,setHeroId]=useState('');
 const [fateHeroId,setFateHeroId]=useState('');
 const [fateKind,setFateKind]=useState<WarFateAction['kind']>('spend-bonus');
 const [fateOutcome,setFateOutcome]=useState<'unconscious'|'captured'|'death'>('unconscious');
 const [recoveryHeroId,setRecoveryHeroId]=useState('');
 const [recoveryInterval,setRecoveryInterval]=useState<RecoveryInterval>('daily-wound');
 const [recoveryActivity,setRecoveryActivity]=useState<RecoveryActivity>('rest');
 const [recoveryHealer,setRecoveryHealer]=useState(false);
 const [recoveryHealerRank,setRecoveryHealerRank]=useState(4);
 const [heroAction,setHeroAction]=useState<WarHeroAction['kind']|'personal-attack-unit'>('join');
 const [heroUnitId,setHeroUnitId]=useState('');
 const [heroTargetId,setHeroTargetId]=useState('');
 const [splitSecondTargetId,setSplitSecondTargetId]=useState('');
 const [healTargetId,setHealTargetId]=useState('');
 const [splitFirstRank,setSplitFirstRank]=useState(1);
 const [splitFirstBonus,setSplitFirstBonus]=useState(0);
 const [splitSecondBonus,setSplitSecondBonus]=useState(0);
 const [heroTryGrapple,setHeroTryGrapple]=useState(false);
 const [heroRanged,setHeroRanged]=useState(false);
 const [heroGripTwoHands,setHeroGripTwoHands]=useState(false);
 const [heroStunHit,setHeroStunHit]=useState(false);
 const [heroPowerBonus,setHeroPowerBonus]=useState(0);
 const [counterAgainstCharge,setCounterAgainstCharge]=useState(false);
 const [mountEscapeSkill,setMountEscapeSkill]=useState<'athletics'|'agility'>('athletics');
 const [heroTargetUnitId,setHeroTargetUnitId]=useState('');
 const [squadUnitId,setSquadUnitId]=useState('');
 const [attackHeroWithUnit,setAttackHeroWithUnit]=useState(false);
 const [unitTargetHeroId,setUnitTargetHeroId]=useState('');
 const [heroMetres,setHeroMetres]=useState({x:25,y:55});
 const [fortKind,setFortKind]=useState<WarFortKind|'none'>('none');
 const [fortEngineer,setFortEngineer]=useState(false);
 const [siegeKind,setSiegeKind]=useState<WarSiegeKind>('catapult-small');
 const [siegeAmmo,setSiegeAmmo]=useState<WarSiegeAmmo>('stone');
 const [siegeTargetMode,setSiegeTargetMode]=useState<'unit'|'fort'|'hero'>('unit');
 const [siegeHeroId,setSiegeHeroId]=useState('');
 const [siegeFortId,setSiegeFortId]=useState('');
 const [resourceScenario,setResourceScenario]=useState<WarResourceScenario>({
  occupiedDomain:false,garrisonHeldForThreeMonths:false,
  capturedLandValue:0,survivingFortDefenseValue:0,
  domainHasCommunityOrFort:false,transferredWealthInvestments:0,
 });
 const [officialBySlot,setOfficialBySlot]=useState<Partial<Record<Slot,WarUnit>>>({});
 const [selected,setSelected]=useState('');
 const [target,setTarget]=useState('');
 const [advancedSecondTarget,setAdvancedSecondTarget]=useState('');
 const [advancedFirstDice,setAdvancedFirstDice]=useState(1);
 const [advancedAllyId,setAdvancedAllyId]=useState('');
 const [pincerFirstWarfare,setPincerFirstWarfare]=useState(1);
 const [wallDifficulty,setWallDifficulty]=useState(12);
 const [scorchedDomain,setScorchedDomain]=useState('');
 const [kind,setKind]=useState<WarOrderKind>('attack');
 const [ranged,setRanged]=useState(false);
 const [readyTrigger,setReadyTrigger]=useState<'enemy-adjacent'|'enemy-routed'>('enemy-adjacent');
 const [readyReaction,setReadyReaction]=useState<'attack'|'move'>('attack');
 const [sprint,setSprint]=useState(false);
 const [coord,setCoord]=useState({x:4,y:3});
 const [error,setError]=useState('');
 const [mapExpanded,setMapExpanded]=useState(false);
 const [eventFilter,setEventFilter]=useState<'all'|'attacker'|'defender'|'dice'>('all');
 const [aftermathSide,setAftermathSide]=useState<'all'|WarSide>('all');
 const start=()=>{
  try{
   const prepared=positionedWarLabDeployments(extraUnitsPerSide,deploymentPositions);
   if(siegeEnabled&&officialBySlot['attacker-2']&&
    officialBySlot['attacker-2'].typeId!=='engineers')
    throw new Error('O segundo espaço do atacante deve ter engenheiros para operar o cerco.');
   const units=prepared.map(row=>{
    const imported=officialBySlot[row.id as Slot];
    const model=imported?{...imported,side:row.side,position:row.position}:
     modelWarUnit({...row,training,
      typeId:siegeEnabled&&row.id==='attacker-2'?'engineers':types[row.id]??'infantry'});
    const equipped=row.id==='attacker-1'&&modelFieldEquipment!=='none'?
     {...model,fieldEquipment:modelFieldEquipment}:model;
    // Opção exclusiva da simulação, não altera fichas importadas.
    return hiddenModelSide===row.side&&row.id===row.side+'-1'?
     {...equipped,hidden:true}:equipped;
   });
   const engineer=units.find(u=>u.side==='attacker'&&u.typeId==='engineers');
   if(siegeEnabled&&!engineer)throw new Error('Cerco exige unidade de engenheiros.');
   const siege=siegeEnabled&&engineer?[makeModelSiege({
    id:'siege-attacker-1',kind:siegeKind,side:'attacker',
    position:{x:1,y:3},engineerId:engineer.id,
    ammo:siegeKind.startsWith('catapult')?siegeAmmo:
     siegeKind==='fire-pot'?(siegeAmmo==='wildfire'?'wildfire':'oil'):'stone',
   })]:[];
   if(modelOneHandUnavailable&&modelOffhand!=='none')
    throw new Error('Não é possível usar arma secundária com uma mão indisponível.');
   setBattle(createWarBattle({id:'book-lab-'+seed,name,seed,width:12,height:7,
    strictLineOfSight:strictSightline,
    units,siege,
    heroes:heroesEnabled?[
     {...equipModelWarOffhand(equipModelWarHero(makeModelWarHero({
      id:'hero-attacker',name:'Herói atacante',side:'attacker',
      position:{x:2,y:5}}),{melee:modelMelee,ranged:modelRanged}),
      modelOffhand==='none'?null:modelOffhand),healing:modelHealingRank,
      oneHandUnavailable:modelOneHandUnavailable,
      strengthBonusDice:modelStrengthBonus,
      ...(modelMountEnabled?{mount:makeModelWarMount({id:'horse-attacker',
       name:'Corcel atacante',trainedForWar:true})}:{})},
     {...equipModelWarOffhand(equipModelWarHero(makeModelWarHero({
      id:'hero-defender',name:'Herói defensor',side:'defender',
      position:{x:9,y:5}}),{melee:modelMelee,ranged:modelRanged}),
      modelOffhand==='none'?null:modelOffhand),healing:modelHealingRank,
      strengthBonusDice:modelStrengthBonus,
      ...(modelMountEnabled?{mount:makeModelWarMount({id:'horse-defender',
       name:'Corcel defensor',trainedForWar:true})}:{})},
    ]:[],
    fortifications:fortKind==='none'?[]:[makeWarFortification({
     id:'defender-fort',name:WAR_FORT_PROFILES[fortKind].label,side:'defender',
     kind:fortKind,cells:WAR_FORT_PROFILES[fortKind].capacity===1?[{x:10,y:2}]:
      [{x:10,y:2},{x:10,y:4}],engineerBuilt:fortKind==='temporary'&&fortEngineer,
     hoursBuilt:fortKind==='temporary'?6:24,
    })],
    commanders:modelWarCommanders(warfare),tiles,weather,visibility,advancedFormations:advanced,
    manualMitigation,
   }));
   setSelected('');setTarget('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao preparar a batalha.');}
 };
 const commander=battle?.commanders.find(c=>c.side===battle.turn&&c.role==='commander'&&c.active);
 const activeUnits=battle?.units.filter(u=>u.side===battle.turn&&
  !['destroyed','escaped','surrendered'].includes(u.condition))??[];
 const selectedUnit=activeUnits.find(u=>u.id===selected)??activeUnits[0];
 const enemy=battle?.units.filter(u=>u.side!==battle.turn&&
  !['destroyed','escaped','surrendered'].includes(u.condition))??[];
 const selectedTarget=enemy.find(u=>u.id===target)??enemy[0];
 const legalKind:WarOrderKind=selectedUnit?.condition==='routed'?'revive':kind;
 const order=()=>{
  if(!battle||!commander||!selectedUnit){setError('Selecione um comandante e uma unidade.');return;}
  try{
   if(legalKind==='surrender'&&!window.confirm('Confirmar rendição geral de todo este exército na simulação?'))return;
   if(legalKind==='pincer'){
    if(!selectedTarget)throw new Error('Selecione inimigo para a Pinça.');
    const other=advancedAllyId||activeUnits.find(u=>u.id!==selectedUnit.id)?.id||'';
    const outcome=issueWarPincer(battle,{commanderId:commander.id,
     firstUnitId:selectedUnit.id,secondUnitId:other,
     targetId:selectedTarget.id,firstWarfareDice:pincerFirstWarfare});
    setBattle(outcome.battle);setError('');return;
   }
   const command:WarOrder={
    kind:legalKind,
    ...(legalKind==='attack'&&attackHeroWithUnit?
     {targetHeroId:unitTargetHeroId||battle.heroes.find(h=>h.side!==battle.turn&&h.active)?.id||''}:{ }),
    ...(['attack','charge','aggressive-retreat','suppress','probe','ambush','push','envelop','hammer-anvil','fire-special'].includes(legalKind)&&selectedTarget&&
     !(legalKind==='attack'&&attackHeroWithUnit)?
     {targetId:selectedTarget.id}:{}),
    ...(legalKind==='join'?{targetId:activeUnits.find(u=>u.id!==selectedUnit.id)?.id??''}:{}),
    ...(legalKind==='sabotage'?{fortId:battle.fortifications.find(x=>x.side!==battle.turn)?.id??''}:{}),
    ...(legalKind==='breach-gate'?{
     fortId:siegeFortId||(battle.fortifications.find(x=>x.side!==battle.turn&&!x.breached)?.id??''),
     wallDifficulty,
    }:{}),
    ...(legalKind==='move'?{to:coord,sprint}:{}),
    ...(['lightning-attack','trample'].includes(legalKind)?{to:coord}:{}),
    ...(legalKind==='split-attack'?{
     targetIds:[selectedTarget?.id??'',
      advancedSecondTarget||enemy.find(u=>u.id!==selectedTarget?.id)?.id||''],
     testRanks:[advancedFirstDice,
      (ranged?selectedUnit.ability.marksmanship:selectedUnit.ability.fighting)-
       advancedFirstDice],
     bonusRanks:[0,0],ranged,
    }:{}),
    ...(legalKind==='scorched-earth'?{targetDomainId:scorchedDomain.trim()}:{}),
    ...(legalKind==='hammer-anvil'?{auxiliaryUnitId:
     advancedAllyId||activeUnits.find(u=>u.id!==selectedUnit.id)?.id||''}:{}),
    ...(legalKind==='climb-walls'?{
     fortId:battle.fortifications.find(f=>f.side!==battle.turn&&!f.breached)?.id??'',
     wallDifficulty,
    }:{}),
    ...(legalKind==='ready'?{ready:{
     trigger:readyTrigger,reaction:readyReaction,
     ...(readyReaction==='move'?{to:coord}:{ranged}),
    }}:{}),
    ...(legalKind==='formation'?{formation}:{}),
    ...(legalKind==='turn'?{facing}:{}),
    ...(['attack','aggressive-retreat','ambush'].includes(legalKind)?{ranged}:{}),
   };
   const result=issueWarOrder(battle,{commanderId:commander.id,unitId:selectedUnit.id,order:command});
   setBattle(result.battle);setSelected('');setTarget('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Ordem não executada.');}
 };
 const siegeAction=(fire:boolean)=>{
  if(!battle||battle.phase!=='siege')return;
  try{
   const activeWeapons=battle.siege.filter(w=>w.side===battle.turn&&w.health>0);
   const leader=battle.commanders.find(x=>x.side===battle.turn&&x.role==='commander'&&x.active);
   const availableTargets=battle.units.filter(u=>u.side!==battle.turn&&
    !['destroyed','escaped','surrendered'].includes(u.condition));
   const selected=availableTargets.find(u=>u.id===target)??availableTargets[0];
   const fort=battle.fortifications.find(f=>f.id===siegeFortId&&
    f.side!==battle.turn&&!f.breached)??battle.fortifications.find(f=>
    f.side!==battle.turn&&!f.breached);
   if(fire&&leader&&activeWeapons.length){
    if(siegeTargetMode==='unit'&&!selected)
     throw new Error('Selecione uma unidade inimiga.');
    if(siegeTargetMode==='fort'&&!fort)
     throw new Error('Não existe fortificação inimiga íntegra.');
    const hero=battle.heroes.find(h=>h.id===siegeHeroId&&h.active&&
     h.side!==battle.turn&&!h.unitId)??battle.heroes.find(h=>h.active&&
     h.side!==battle.turn&&!h.unitId);
    if(siegeTargetMode==='hero'&&!hero)
     throw new Error('Selecione personagem inimigo para o escorpião.');
    setBattle(fireWarSiegeVolley(battle,{commanderId:leader.id,
     weaponIds:[activeWeapons[0]!.id],
     ...(siegeTargetMode==='fort'?{fortId:fort!.id}:
      siegeTargetMode==='hero'?{targetHeroId:hero!.id}:{targetId:selected!.id}),
    }));
   }else setBattle(skipWarSiege(battle));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Disparo não executado.');}
 };
 const heroDo=()=>{
  if(!battle)return;
  const hero=battle.heroes.find(h=>h.id===heroId)??battle.heroes.find(h=>h.active);
  if(!hero){setError('Não há herói ativo.');return;}
  try{
   const candidate=battle.units.find(u=>u.id===heroUnitId&&u.side===hero.side);
   const matching=battle.units.find(u=>u.side===hero.side&&u.condition==='organized'&&
    Math.max(Math.abs(u.position.x-hero.position.x),Math.abs(u.position.y-hero.position.y))<=1);
   if(heroAction==='personal-attack-unit'){
    const victim=battle.units.find(u=>u.id===heroTargetUnitId&&u.side!==hero.side)??
     battle.units.find(u=>u.side!==hero.side&&
      !['destroyed','surrendered','escaped'].includes(u.condition));
    if(!victim)throw new Error('Selecione uma unidade inimiga.');
    setBattle(executeWarHeroAttackUnit(battle,{heroId:hero.id,unitId:victim.id,
     ranged:heroRanged,
     ...(!heroRanged?{twoHandedGrip:heroGripTwoHands}:{}),
     ...(!heroRanged||hero.rangedWeapon?.powerful?{powerBonusDice:heroPowerBonus}:{}) ,
    }));setError('');return;
   }
   const action:WarHeroAction={
    kind:heroAction,
    ...(['join','rally','revive'].includes(heroAction)?
     {unitId:candidate?.id??matching?.id??''}:{}),
    ...(['personal-attack','personal-charge','personal-attack-mount',
     'personal-cautious-attack','personal-reckless-attack',
     'personal-dual-attack'].includes(heroAction)?
     {targetHeroId:heroTargetId||battle.heroes.find(h=>h.side!==hero.side&&h.active)?.id||''}:{}),
    ...(['personal-move','personal-trample','personal-control-mount'].includes(heroAction)?{toMetres:heroMetres}:{}),
    ...(heroAction==='personal-heal-remove-impale'?{targetHeroId:healTargetId}:{}),
    ...(['personal-free-mount','personal-escape-entangle'].includes(heroAction)?
     {escapeUsing:mountEscapeSkill}:{}),
    ...(['personal-split-attack','personal-combined-attack'].includes(heroAction)?{
     splitTargets:[heroTargetId||battle.heroes.find(h=>h.side!==hero.side&&h.active)?.id||'',
      splitSecondTargetId],
     splitRanks:[splitFirstRank,hero.fighting-splitFirstRank],
     splitBonuses:[splitFirstBonus,splitSecondBonus],
    }:{}),
    ...(['personal-attack','personal-cautious-attack','personal-charge'].includes(heroAction)&&
     !heroRanged&&hero.meleeWeapon?.grapple?{grappleHit:heroTryGrapple}:{}),
    ...(['personal-attack','personal-cautious-attack','personal-attack-mount'].includes(heroAction)?{ranged:heroRanged}:{}),
    ...(heroAction==='personal-counterattack'?{
     ranged:heroRanged,vsCharge:counterAgainstCharge,
    }:{}),
    ...(['personal-attack','personal-cautious-attack',
      'personal-reckless-attack','personal-charge'].includes(heroAction)&&
      (!heroRanged||['personal-reckless-attack','personal-charge'].includes(heroAction))&&
      hero.meleeWeapon?.stunning?{stunHit:heroStunHit}:{}),
    ...(['personal-attack','personal-cautious-attack',
      'personal-reckless-attack','personal-charge'].includes(heroAction)&&
      (!heroRanged||['personal-reckless-attack','personal-charge'].includes(heroAction))?
      {twoHandedGrip:heroGripTwoHands,powerBonusDice:heroPowerBonus}:
      ['personal-attack','personal-cautious-attack'].includes(heroAction)&&
      hero.rangedWeapon?.powerful?{powerBonusDice:heroPowerBonus}:{}),
   };
   setBattle(executeWarHeroAction(battle,{heroId:hero.id,action}));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível agir com o herói.');}
 };
 const resolveDamage=()=>{
  if(!battle?.pendingPersonalDamage)return;
  try{setBattle(resolvePendingPersonalDamage(battle,{
   kind:mitigationKind,...(mitigationKind==='wounds'?{woundCount:mitigationWounds}:{}),
  }));setMitigationKind('none');setMitigationWounds(1);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Falha ao mitigar o dano.');}
 };
 const squadDeploy=()=>{
  if(!battle)return;
  try{
   const unit=battle.units.find(u=>u.id===squadUnitId)??battle.units.find(u=>
    u.condition==='organized'||u.condition==='disorganized');
   if(!unit)throw new Error('Selecione uma unidade ativa para destacar soldados.');
   const id='destacamento-'+unit.id+'-'+battle.round+'-'+(battle.squads?.length??0);
   setBattle(deployWarSquad(battle,{unitId:unit.id,squadId:id}));setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível destacar o esquadrão.');}
 };
 const fateDo=()=>{
  if(!battle)return;
  const h=battle.heroes.find(x=>x.id===fateHeroId&&!x.squadId)??
   battle.heroes.find(x=>!x.squadId);
  if(!h){setError('Escolha um personagem importante.');return;}
  try{setBattle(applyWarFate(battle,{heroId:h.id,kind:fateKind,
   ...(fateKind==='burn-choose-defeat'?{outcome:fateOutcome}:{})}));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Destino não executado.');}
 };
 const fateRefill=()=>{
  if(!battle)return;
  const h=battle.heroes.find(x=>x.id===fateHeroId&&!x.squadId)??
   battle.heroes.find(x=>!x.squadId);
  if(!h)return;
  try{setBattle(restoreSpentFate(battle,h.id));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Recarga não executada.');}
 };
 const recoveryDo=()=>{
  if(!battle)return;
  const h=battle.heroes.find(x=>x.id===recoveryHeroId&&!x.squadId)??
   battle.heroes.find(x=>!x.squadId);
  if(!h){setError('Selecione um personagem.');return;}
  try{setBattle(resolveLabRecovery(battle,{heroId:h.id,
   interval:recoveryInterval,activity:recoveryActivity,
   ...(recoveryHealer?{healer:{rank:recoveryHealerRank,hours:4}}:{})}));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Recuperação não executada.');}
 };
 const restoreNormalDamage=()=>{
  if(!battle)return;
  try{setBattle(restoreOrdinaryDamageAfterBattle(battle));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Dano não restaurado.');}
 };
 const heroDelay=()=>{
  if(!battle)return;
  try{
   const id=heroId||personalTurnHeroId(battle)||'';
   setBattle(delayPersonalTurn(battle,id));setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível atrasar.');}
 };
 const heroInitiative=()=>{
  if(!battle)return;
  try{setBattle(beginPersonalInitiative(battle));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Falha na iniciativa pessoal.');}
 };
 const heroFinish=()=>{
  if(!battle)return;
  try{setBattle(completeWarHeroPhase(battle));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Erro ao concluir a fase de heróis.');}
 };
 const endRound=()=>{
  if(!battle)return;
  try{setBattle(advanceWarRound(battle));setSelected('');setTarget('');setError('');}
  catch(e){setError(e instanceof Error?e.message:'Erro ao concluir rodada.');}
 };
 const saveLocalBattle=()=>{
  if(!battle)return;
  try{
   window.localStorage.setItem(GOT_LAB_SAVE_KEY,encodeGotLabSave(battle));
   setLocalSaveStatus('Simulação salva somente neste navegador.');
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar localmente.');}
 };
 const loadLocalBattle=()=>{
  try{
   const saved=window.localStorage.getItem(GOT_LAB_SAVE_KEY);
   if(!saved)throw new Error('Nenhuma simulação local foi encontrada neste navegador.');
   if(battle&&!window.confirm('Substituir a simulação atual pela versão salva?'))return;
   const loaded=decodeGotLabSave(saved);
   setBattle(loaded);setSelected('');setTarget('');setError('');
   setLocalSaveStatus('Simulação retomada. Rodada '+loaded.round+'.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível retomar a simulação.');}
 };
 const clearLocalBattle=()=>{
  if(!window.confirm('Apagar a cópia local desta simulação? A batalha aberta não será alterada.'))return;
  try{window.localStorage.removeItem(GOT_LAB_SAVE_KEY);
   setLocalSaveStatus('Cópia local apagada.');setError('');
  }catch{setError('Não foi possível apagar a cópia local.');}
 };
 const preparedDeployments=modelWarLabDeployments(extraUnitsPerSide);
 const aftermath=battle?.phase==='finished'?previewWarAftermath(battle):null;
 const projectedResources=battle?.phase==='finished'?
  previewWarResourceConsequences(battle,resourceScenario.occupiedDomain?
   resourceScenario:{...resourceScenario,capturedLandValue:0,
    survivingFortDefenseValue:0,transferredWealthInvestments:0,
    garrisonHeldForThreeMonths:false}):null;
 const movePreview=battle&&selectedUnit&&battle.phase==='orders'?
  previewWarMovement(battle,selectedUnit.id,coord,sprint):null;
 const pathSquares=new Set(legalKind==='move'&&movePreview?.legal?
  movePreview.path.map(p=>p.x+':'+p.y):[]);
 const inspectedTile=battle?terrainAt(battle.tiles,coord):null;
 const inspectedEffect=inspectedTile?terrainEffect(inspectedTile):null;
 const battleEvents=battle?.events.filter(e=>eventFilter==='all'||
  (eventFilter==='dice'?Boolean(e.roll):e.side===eventFilter)).slice(-30)??[];
 return <section className="battle-got" aria-label="Batalha pelas regras de Guerra dos Tronos RPG">
  <div className="battle-heading">
   <div><h2>Game of Thrones · regras do livro</h2>
    <p>Laboratório do capítulo 10 · quadrados de 10 m · uma rodada representa 1 minuto.</p></div>
   <Button variant="outline" onClick={onBack}>Voltar ao módulo</Button>
  </div>
  <p className="battle-note">Laboratório isolado do Adaptado e D&D.
   Ordens, heróis, cerco, formações e pós-batalha estão disponíveis para testes;
   regras excepcionais e parâmetros de fortificações podem exigir decisão do Narrador.
   Nenhuma baixa ou alteração é aplicada às fichas oficiais das Casas.</p>
  <section className="battle-surface got-save-panel" aria-label="Salvar e retomar teste local">
   <div className="got-save-actions">
    {battle&&<Button variant="outline" onClick={saveLocalBattle}>Salvar simulação neste navegador</Button>}
    <Button variant="outline" onClick={loadLocalBattle}>Retomar simulação salva</Button>
    <Button variant="outline" onClick={clearLocalBattle}>Apagar cópia salva</Button>
   </div>
   <p className="battle-note">Salvamento manual, exclusivo deste navegador. Não publica
    resultados, não grava em contas nem modifica exércitos ou recursos oficiais.</p>
   {localSaveStatus&&<p role="status">{localSaveStatus}</p>}
  </section>
  {!battle?<section className="battle-surface got-config" aria-label="Preparar campo de guerra">
   <h3>Preparar confronto conforme a escala do livro</h3>
   <label>Nome da batalha <input value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label>
   <label>Semente reprodutível <input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100}/></label>
   <div className="got-config-grid">
    {(['attacker','defender'] as const).map(side=><div key={side}>
     <h4>{SIDE[side]}</h4>
     <label>Guerra do comandante
      <select value={warfare[side]} onChange={e=>setWarfare(v=>({...v,[side]:Number(e.target.value)}))}>
       {[2,3,4,5,6].map(rank=><option key={rank} value={rank}>{rank}</option>)}
      </select>
     </label>
     {Array.from({length:2+extraUnitsPerSide},(_,i)=>i+1).map(n=>{
      const id=side+'-'+n;
      return <label key={id}>Unidade {n}
       <select value={types[id]??'infantry'} onChange={e=>setTypes(v=>({...v,[id]:e.target.value as TypeId}))}>
        {OPTIONS.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
       </select>
      </label>;
     })}
    </div>)}
   </div>
   <label>Unidades adicionais por lado (tropas-modelo, sem modificar Casas)
    <select value={extraUnitsPerSide}
     onChange={e=>setExtraUnitsPerSide(Number(e.target.value))}>
     {Array.from({length:13},(_,n)=>n).map(n=><option key={n} value={n}>
      {n===0?'Duas unidades por lado':(2+n)+' unidades por lado · '+(4+2*n)+' totais'}
     </option>)}
    </select>
   </label>
   <label>Equipamento especial da vanguarda atacante (somente laboratório)
    <select value={modelFieldEquipment}
     onChange={e=>setModelFieldEquipment(e.target.value as 'none'|WarFieldEquipmentId)}>
     <option value="none">Nenhum equipamento especial</option>
     {Object.values(WAR_FIELD_EQUIPMENT).map(item=>
      <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
   </label>
   <label>Treinamento das tropas-modelo
    <select value={training} onChange={e=>setTraining(e.target.value as WarUnit['training'])}>
     <option value="green">Verde</option><option value="trained">Treinada</option>
     <option value="veteran">Veterana</option><option value="elite">Elite</option>
    </select>
   </label>
   <div className="got-config-grid">
    <label>Clima
     <select value={weather} onChange={e=>setWeather(e.target.value as WarWeather)}>
      <option value="clear">Tempo aberto</option><option value="light-rain">Chuva leve</option>
      <option value="heavy-rain">Chuva forte</option><option value="light-snow">Neve leve</option>
      <option value="heavy-snow">Neve forte</option>
     </select>
    </label>
    <label>Visibilidade
     <select value={visibility} onChange={e=>setVisibility(e.target.value as WarVisibility)}>
      <option value="clear">Clara</option><option value="dim">Penumbra</option>
      <option value="dark">Escura</option>
     </select>
    </label>
   </div>
   <label className="got-check"><input type="checkbox" checked={manualMitigation}
    onChange={e=>setManualMitigation(e.target.checked)}/>
    Escolha de ferimentos/lesões após ser atingido (laboratório, sem alterar fichas)</label>
   <label className="got-check"><input type="checkbox" checked={heroesEnabled}
    onChange={e=>setHeroesEnabled(e.target.checked)}/>
    Dois heróis-modelo e fases individuais (Passos 6 e 8)</label>
   {heroesEnabled&&<label className="got-check">
    <input type="checkbox" checked={modelMountEnabled}
     onChange={e=>setModelMountEnabled(e.target.checked)}/>
    Disponibilizar cavalos treinados para os heróis-modelo (combate montado)</label>}
   {heroesEnabled&&<div className="got-config-grid">
    <label>Arma de Luta dos heróis-modelo
     <select value={modelMelee} onChange={e=>setModelMelee(e.target.value as WarPersonalWeaponId)}>
      {Object.values(WAR_PERSONAL_WEAPONS).filter(w=>w.family==='melee').map(w=>
       <option key={w.id} value={w.id}>{w.label}</option>)}
     </select>
    </label>
    <label>Arma secundária / escudo Defensivo
     <select value={modelOffhand} onChange={e=>setModelOffhand(e.target.value as 'none'|WarPersonalWeaponId)}>
      <option value="none">Nenhuma</option>
      {Object.values(WAR_PERSONAL_WEAPONS).filter(w=>w.family==='melee'&&
       Boolean(w.offhandDamageBonus||w.defensiveOffhandBonus)).
       map(w=><option key={w.id} value={w.id}>{w.label} ·
        +{w.offhandDamageBonus??0} dano /
        +{w.defensiveOffhandBonus??0} Defesa
       </option>)}
     </select>
    </label>
    <label className="got-check">
     <input type="checkbox" checked={modelOneHandUnavailable}
      onChange={e=>setModelOneHandUnavailable(e.target.checked)}/>
     Uma mão indisponível (−2D com arma de Duas Mãos; incompatível com secundária)
    </label>
    <label>Graduação em Cura (heróis-modelo)
     <input type="number" min={1} max={15} value={modelHealingRank}
      onChange={e=>setModelHealingRank(Math.max(1,Math.min(15,Number(e.target.value))))}/>
    </label>
    <label>Dados bônus de Força (heróis-modelo)
     <input type="number" min={0} max={5} value={modelStrengthBonus}
      onChange={e=>setModelStrengthBonus(Math.max(0,Math.min(5,Number(e.target.value))))}/>
    </label>
    <label>Arma de Pontaria dos heróis-modelo
     <select value={modelRanged} onChange={e=>setModelRanged(e.target.value as WarPersonalWeaponId)}>
      {Object.values(WAR_PERSONAL_WEAPONS).filter(w=>w.family==='ranged').map(w=>
       <option key={w.id} value={w.id}>{w.label}</option>)}
     </select>
    </label>
   </div>}
   <label>Fortificação do defensor
    <select value={fortKind} onChange={e=>setFortKind(e.target.value as WarFortKind|'none')}>
     <option value="none">Sem fortificação</option>
     {Object.entries(WAR_FORT_PROFILES).map(([id,row])=><option key={id} value={id}>
      {row.label} · Defesa +{row.defense} · até {row.capacity} unidade(s)
     </option>)}
    </select>
   </label>
   {fortKind==='temporary'&&<label className="got-check">
    <input type="checkbox" checked={fortEngineer}
     onChange={e=>setFortEngineer(e.target.checked)}/>
    Construída por engenheiros (+2 Defesa total; seis horas antes da batalha)
   </label>}
   <label className="got-check"><input type="checkbox" checked={siegeEnabled}
    onChange={e=>setSiegeEnabled(e.target.checked)}/>
    Preparar arma de cerco do atacante (troca o apoio atacante por engenheiros)</label>
   {siegeEnabled&&<div className="got-config-grid">
    <label>Arma de cerco
     <select value={siegeKind} onChange={e=>{
      const chosen=e.target.value as WarSiegeKind;
      setSiegeKind(chosen);
      if(chosen==='fire-pot')setSiegeAmmo('oil');
    }}>
      {Object.values(WAR_SIEGE_CATALOG).map(row=><option key={row.kind} value={row.kind}>
       {row.label} · alcance {row.rangeMetres} m</option>)}
     </select>
    </label>
    {(siegeKind.startsWith('catapult')||siegeKind==='fire-pot')&&<label>Munição
     <select value={siegeAmmo} onChange={e=>setSiegeAmmo(e.target.value as WarSiegeAmmo)}>
      {siegeKind!=='fire-pot'&&<option value="stone">Pedra</option>}
      <option value="oil">Óleo (ignora VA)</option>
      <option value="wildfire">Fogo selvagem (ignora VA + 2d6 rodadas)</option>
     </select>
    </label>}
   </div>}
   <label className="got-check"><input type="checkbox" checked={advanced}
    onChange={e=>setAdvanced(e.target.checked)}/> Usar formações e ângulo frontal (opcional no livro)</label>
   <label className="got-check"><input type="checkbox" checked={strictSightline}
    onChange={e=>setStrictSightline(e.target.checked)}/>
    Bloquear tiros através de muralhas e montanhas (adaptação digital opcional)
   </label>
   <label>Emboscada de treinamento (primeira unidade escondida)
     <select value={hiddenModelSide}
      onChange={e=>setHiddenModelSide(e.target.value as 'none'|WarSide)}>
      <option value="none">Nenhuma unidade escondida</option>
      <option value="attacker">Atacante · unidade 1</option>
      <option value="defender">Defensor · unidade 1</option>
     </select>
    </label>
    <h4>Terreno e posicionamento inicial</h4>
   <div className="got-config-grid">
    <label>Editar mapa
     <select value={deploymentMode}
      onChange={e=>setDeploymentMode(e.target.value as 'paint'|'deploy')}>
      <option value="paint">Pintar o terreno</option>
      <option value="deploy">Posicionar unidades</option>
     </select>
    </label>
    {deploymentMode==='deploy'&&<label>Tropa selecionada para posicionar
     <select value={deploymentSelected}
      onChange={e=>setDeploymentSelected(e.target.value)}>
      {preparedDeployments.map(u=><option key={u.id} value={u.id}>
       {u.name} · {SIDE[u.side]}</option>)}
     </select>
    </label>}
   </div>
   {deploymentMode==='deploy'&&<>
    <p className="battle-note">Selecione uma tropa e toque no quadrado de destino.
     Não é permitido sobrepor unidades. O tabuleiro de combate tem 12 × 7 quadrados.</p>
    <Button variant="outline" onClick={()=>{setDeploymentPositions({});setError('');}}>
     Restaurar posições iniciais</Button>
   </>}
   <h4>Terreno do campo</h4>
   <label>Pintar quadrados com
    <select value={terrainPaint} onChange={e=>setTerrainPaint(e.target.value as WarTerrainId)}>
     {Object.keys(WAR_TERRAIN).map(id=><option key={id} value={id}>{id}</option>)}
    </select></label>
   <div className="got-map got-paint" style={{gridTemplateColumns:'repeat(12,minmax(0,1fr))'}}>
    {Array.from({length:84},(_,i)=>{
     const x=i%12,y=Math.floor(i/12),terrain=tiles.find(t=>t.x===x&&t.y===y)?.terrain??'plain';
     const occupant=preparedDeployments.find(u=>{
      const p=deploymentPositions[u.id]??u.position;
      return p.x===x&&p.y===y;
     });
     return <button type="button" key={i} data-terrain={terrain}
      className={'got-cell'+(terrain!=='plain'?' got-terrain':'')+(occupant?' got-deployed '+occupant.side:'')}
      title={occupant?.name??terrain}
      aria-label={'Quadrado '+x+','+y+' · '+(occupant?.name??terrain)}
      onClick={()=>{
       if(deploymentMode==='paint'){
        setTiles(prev=>[...prev.filter(t=>t.x!==x||t.y!==y),{x,y,terrain:terrainPaint}]);
       }else{
        try{
         setDeploymentPositions(positionWarLabUnit(extraUnitsPerSide,
          deploymentPositions,deploymentSelected,{x,y}));
         setError('');
        }catch(e){setError(e instanceof Error?e.message:'Posição inválida.');}
       }
      }}>
      {occupant?<><strong>{occupant.side==='attacker'?'A':'D'}</strong>
       <small>{occupant.id.split('-').at(-1)}</small></>:
       terrain==='plain'?'·':'▥'}
     </button>;
    })}
   </div>
   <p className="battle-note">Pinte o terreno antes de iniciar; cada quadrado tem 10 metros. Campos com obstáculos não são automaticamente removidos quando contêm tropas.</p>
   <BattleGotSourcePicker chosenSlots={officialBySlot} onChoose={(slot,unit)=>
    setOfficialBySlot(current=>{
     const next={...current};
     if(unit)next[slot]=unit;
     else delete next[slot];
     return next;
    })}/>
   <Button onClick={start}>Iniciar simulação pelo livro</Button>
  </section>:<>
   <section className="battle-surface got-status" aria-label="Estado da guerra" aria-live="polite">
    <h3>{battle.name}</h3>
    <p>Rodada <strong>{battle.round}</strong> · {battle.phase==='finished'?
     'Combate encerrado':battle.phase==='heroes-first'||battle.phase==='heroes-second'?
     'Ações individuais dos heróis':<>Comanda agora: <strong>{SIDE[battle.turn]}</strong></>}
     {' '}· Iniciativa: {SIDE[battle.first]}</p>
    <p>Ordens restantes: {battle.commanders.map(c=>
     c.name+': '+(battle.ordersRemaining[c.id]??0)).join(' · ')}</p>
    {battle.phase==='finished'&&<p role="status"><strong>
     {battle.winner?'Vitória do '+SIDE[battle.winner]:'Confronto sem vencedor'}
    </strong></p>}
   </section>
   {battle.heroes.some(h=>!h.squadId)&&
    <section className="battle-surface got-heroes" aria-label="Pontos de Destino dos heróis">
     <h3>Destino do capítulo 5 · simulação local</h3>
     <div className="got-config-grid">
      <label>Personagem importante
       <select value={fateHeroId}
        onChange={e=>setFateHeroId(e.target.value)}>
        <option value="">Selecione um herói</option>
        {battle.heroes.filter(h=>!h.squadId).map(h=>
         <option key={h.id} value={h.id}>{h.name} ·
          {fateAvailable(h)} disponível(is), {h.fateSpent??0} gasto(s),
          {h.fateBurned??0} queimado(s)</option>)}
       </select>
      </label>
      <label>Efeito de Destino
       <select value={fateKind} onChange={e=>setFateKind(e.target.value as WarFateAction['kind'])}>
        <option value="spend-bonus">Gastar · +1B no próximo teste</option>
        <option value="spend-reduce-penalty">Gastar · remover −1D no próximo teste</option>
        <option value="burn-clear-damage">Queimar · restaurar Saúde e ferimentos</option>
        <option value="burn-choose-defeat">Queimar · escolher consequência da derrota</option>
        <option value="burn-avoid-death">Queimar · evitar morte certa, sair da história</option>
       </select>
      </label>
      {fateKind==='burn-choose-defeat'&&
       <label>Consequência
        <select value={fateOutcome}
         onChange={e=>setFateOutcome(e.target.value as typeof fateOutcome)}>
         <option value="unconscious">Inconsciência</option>
         <option value="captured">Captura</option>
         <option value="death">Morte</option>
        </select>
       </label>}
     </div>
     <p className="battle-note">Gastos só retornam após um marco narrativo.
      Pontos queimados não retornam. A simulação não atualiza a ficha oficial.</p>
     <Button onClick={fateDo} disabled={Boolean(battle.pendingPersonalDamage)}>
      Usar Ponto de Destino
     </Button>
     {battle.phase==='finished'&&
      <Button variant="outline" onClick={fateRefill}>
       Simular marco narrativo · devolver apenas os pontos gastos
      </Button>}
    </section>}
   {battle.phase==='finished'&&battle.heroes.some(h=>!h.squadId)&&
    <section className="battle-surface got-heroes" aria-label="Recuperação de personagens">
     <h3>Convalescença · capítulo 9</h3>
     <p className="battle-note">Cada execução representa um dia (ferimento)
      ou uma semana (lesão) já decorridos. Não altera o Hub Temporal.</p>
     <div className="got-config-grid">
      <label>Personagem
       <select value={recoveryHeroId} onChange={e=>setRecoveryHeroId(e.target.value)}>
        <option value="">Selecione um herói</option>
        {battle.heroes.filter(h=>!h.squadId).map(h=>
         <option key={h.id} value={h.id}>{h.name} · {h.wounds??0} ferimento(s),
          {h.injuries??0} lesão(ões)</option>)}
       </select>
      </label>
      <label>Intervalo
       <select value={recoveryInterval}
        onChange={e=>setRecoveryInterval(e.target.value as RecoveryInterval)}>
        <option value="daily-wound">Diário · ferimento</option>
        <option value="weekly-injury">Semanal · lesão</option>
       </select>
      </label>
      <label>Atividade
       <select value={recoveryActivity}
        onChange={e=>setRecoveryActivity(e.target.value as RecoveryActivity)}>
        <option value="rest">Repouso</option>
        <option value="light">Atividade leve</option>
        <option value="strenuous">Atividade cansativa</option>
       </select>
      </label>
      <label className="got-check">
       <input type="checkbox" checked={recoveryHealer}
        onChange={e=>setRecoveryHealer(e.target.checked)}/>
       Curandeiro presente (mínimo 4 horas)
      </label>
      {recoveryHealer&&<label>Graduação em Cura
       <input type="number" min={1} max={15} value={recoveryHealerRank}
        onChange={e=>setRecoveryHealerRank(Number(e.target.value))}/>
      </label>}
     </div>
     <div className="got-config-grid">
      <Button onClick={recoveryDo}>Resolver teste de recuperação</Button>
      <Button variant="outline" onClick={restoreNormalDamage}>
       Restaurar dano comum dos sobreviventes
      </Button>
     </div>
    </section>}
   {battle.pendingPersonalDamage&&
    <section className="battle-surface got-heroes" aria-label="Resolver dano pessoal pendente">
     <h3>Escolha de redução de dano · capítulo 9</h3>
     <p><strong>{battle.heroes.find(h=>h.id===battle.pendingPersonalDamage?.targetHeroId)?.name}</strong>
      {' '}sofrerá {battle.pendingPersonalDamage.damage} pontos de dano de
      {' '}{battle.pendingPersonalDamage.actorName}.</p>
     <p className="battle-note">Ferimento: reduz o dano em Vigor e impõe −1
      a resultados futuros. Lesão: cancela todo o dano deste ataque, mas
      impõe −1D e pode causar morte no limite de Vigor.</p>
     <label>Mitigação
      <select value={mitigationKind}
       onChange={e=>setMitigationKind(e.target.value as PersonalMitigationChoice['kind'])}>
       <option value="none">Não reduzir dano</option>
       <option value="wounds">Aceitar ferimentos</option>
       <option value="injury">Aceitar uma lesão</option>
      </select>
     </label>
     {mitigationKind==='wounds'&&<label>Quantidade de ferimentos
      <input type="number" min={1} max={15} value={mitigationWounds}
       onChange={e=>setMitigationWounds(Number(e.target.value))}/>
     </label>}
     <Button onClick={resolveDamage}>Confirmar decisão de dano</Button>
    </section>}
   {(battle.phase==='heroes-first'||battle.phase==='heroes-second')&&
    <section className="battle-surface got-heroes" aria-label="Ações individuais dos heróis">
     <h3>{battle.phase==='heroes-first'?'Passo 6 · Primeiras ações dos heróis':
      'Passo 8 · Segundas ações dos heróis'}</h3>
     <p className="battle-note">Cada fase equivale a cinco rodadas de 6 segundos.
      Combate pessoal usa posições de 1 metro, Luta/Pontaria contra Defesa,
      dano por grau de sucesso menos armadura e ações menores/maiores.
      Especialidades, equipamentos oficiais, iniciativa pessoal e ferimentos
      continuam em desenvolvimento; nenhuma baixa altera fichas da Casa.</p>
     <div className="got-config-grid">
      <label>Destacar dez soldados de
       <select value={squadUnitId}
        onChange={e=>setSquadUnitId(e.target.value)}>
        <option value="">Escolha uma unidade</option>
        {battle.units.filter(u=>u.condition==='organized'||u.condition==='disorganized')
         .map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
       </select>
      </label>
      <Button variant="outline" onClick={squadDeploy}
       disabled={Boolean(battle.personalInitiative?.phase===battle.phase)}>
       Destacar esquadrão de 10 (cap. 10)
      </Button>
     </div>
     {(battle.squads?.length??0)>0&&<p className="battle-note">
      Esquadrões: {battle.squads?.map(s=>s.id+' · '+
       s.memberIds.filter(id=>battle.heroes.find(h=>h.id===id&&!h.active)).length+
       '/10 derrotados'+(s.casualtyRecorded?' · 1 Saúde consolidada':'')).join(' | ')}
     </p>}
     <div className="got-config-grid">
      <label>Herói
       <select value={heroId||battle.heroes[0]?.id||''}
        onChange={e=>{setHeroId(e.target.value);
         const h=battle.heroes.find(row=>row.id===e.target.value);
         if(h)setHeroMetres(h.personalPosition??{
          x:h.position.x*10+5,y:h.position.y*10+5});
        }}>
        {battle.heroes.map(h=><option key={h.id} value={h.id}>
         {h.name} · Saúde {h.health}/{h.maxHealth} · {h.usedActions}/5 rodadas
        </option>)}
       </select>
      </label>
      <label>Ação
       <select value={heroAction} onChange={e=>setHeroAction(e.target.value as WarHeroAction['kind']|'personal-attack-unit')}>
        <option value="join">Entrar em unidade</option>
        {battle.phase==='heroes-second'&&<option value="leave">Sair de unidade</option>}
        <option value="rally">Reorganizar tropa</option>
        <option value="revive">Reanimar tropa</option>
        <option value="abdicate">Abdicar do comando</option>
        <option value="assume">Assumir comando vago</option>
        <option value="personal-attack">Combate pessoal · atacar (menor)</option>
        <option value="personal-aim">Combate pessoal · mirar (+1B, menor)</option>
        <option value="personal-split-attack">Ataque Dividido · vários alvos (maior)</option>
        <option value="personal-dual-attack">Ataque com Duas Armas · secundária aumenta dano (maior)</option>
        <option value="personal-combined-attack">Ataque Combinado · dividido + Mão Inábil (maior)</option>
        <option value="personal-pin-grapple">Imobilizar · agarrado em chão (maior)</option>
        <option value="personal-escape-pin">Imobilizado · escapar (maior)</option>
        <option value="personal-pin-impale">Empalar · prender ao cenário (maior)</option>
        <option value="personal-heal-remove-impale">Cura · aliado remove arma empalada (maior)</option>
        <option value="personal-escape-grapple">Agarrar · escapar (menor)</option>
        <option value="personal-release-grapple">Agarrar · soltar (livre)</option>
        <option value="personal-escape-entangle">Enredar · escapar (maior)</option>
        <option value="personal-release-impale">Empalar · puxar arma do alvo (menor)</option>
        <option value="personal-remove-impale">Empalar · remover arma do corpo (maior)</option>
        <option value="personal-cautious-attack">Ataque Cauteloso (−1D; Defesa +3, menor)</option>
        <option value="personal-reckless-attack">Ataque Imprudente (+1D Luta; Defesa −5, maior)</option>
        <option value="personal-charge">Combate pessoal · carga (maior)</option>
        <option value="personal-attack-unit">Herói atacar unidade inteira · Defesa +20</option>
        <option value="personal-move">Combate pessoal · mover (menor)</option>
        <option value="personal-dodge">Combate pessoal · esquiva (maior)</option>
        <option value="personal-counterattack">Combate pessoal · contra-ataque preparado (maior)</option>
        <option value="personal-reload">Combate pessoal · recarregar arma</option>
        <option value="personal-attack-mount">Combate pessoal · atacar montaria inimiga</option>
        <option value="personal-trample">Montaria · atropelar em linha reta (maior)</option>
        <option value="personal-free-mount">Montaria · libertar-se do cavalo caído (maior)</option>
        <option value="personal-stand">Combate pessoal · levantar-se após queda</option>
        <option value="personal-mount">Montaria · montar (menor)</option>
        <option value="personal-dismount">Montaria · desmontar (menor)</option>
        <option value="personal-control-mount">Montaria · controlar (menor ou maior)</option>
        <option value="personal-recover">Combate pessoal · recuperar o fôlego (maior)</option>
        <option value="personal-pass">Combate pessoal · passar (maior)</option>
        <option value="personal-end-turn">Combate pessoal · encerrar turno</option>
        <option value="personal-surrender">Combate pessoal · render-se (maior)</option>
       </select>
      </label>
      {['personal-attack','personal-charge','personal-attack-mount',
       'personal-cautious-attack','personal-reckless-attack','personal-split-attack',
       'personal-dual-attack','personal-combined-attack'].includes(heroAction)&&
       <label>{heroAction==='personal-attack-mount'?'Cavaleiro da montaria adversária':'Herói adversário'}
        <select value={heroTargetId||battle.heroes.find(h=>h.side!==
         (battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side&&h.active)?.id||''}
         onChange={e=>setHeroTargetId(e.target.value)}>
         {battle.heroes.filter(h=>h.side!==
          (battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side&&h.active&&
          (heroAction!=='personal-attack-mount'||Boolean(h.mount&&h.mount.health>0)))
          .map(h=><option key={h.id} value={h.id}>{h.name}
           {heroAction==='personal-attack-mount'?' · '+h.mount?.name:''}</option>)}
        </select>
       </label>}
      {['personal-split-attack','personal-combined-attack'].includes(heroAction)&&<>
       <label>Segundo alvo distinto
        <select value={splitSecondTargetId}
         onChange={e=>setSplitSecondTargetId(e.target.value)}>
         <option value="">Selecione outro inimigo</option>
         {battle.heroes.filter(h=>h.active&&!h.unitId&&h.side!==
          (battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side&&
          h.id!==heroTargetId).map(h=><option key={h.id} value={h.id}>
           {h.name}</option>)}
        </select>
       </label>
       <label>Dados Luta do primeiro alvo (restante para o segundo)
        <input type="number" min={1}
         max={Math.max(1,(battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.fighting??3)-1}
         value={splitFirstRank}
         onChange={e=>setSplitFirstRank(Number(e.target.value))}/>
       </label>
       <label>Dados bônus do primeiro alvo
        <input type="number" min={0} value={splitFirstBonus}
         onChange={e=>setSplitFirstBonus(Number(e.target.value))}/>
       </label>
       <label>Dados bônus do segundo alvo
        <input type="number" min={0} value={splitSecondBonus}
         onChange={e=>setSplitSecondBonus(Number(e.target.value))}/>
       </label>
      </>}
      {heroAction==='personal-heal-remove-impale'&&<label>Aliado empalado
       <select value={healTargetId} onChange={e=>setHealTargetId(e.target.value)}>
        <option value="">Selecione o aliado</option>
        {battle.heroes.filter(h=>h.active&&h.impaledBy&&h.id!==heroId&&
         h.side===(battle.heroes.find(x=>x.id===heroId)??battle.heroes[0])?.side)
         .map(h=><option value={h.id} key={h.id}>{h.name}</option>)}
       </select>
      </label>}
      {heroAction==='personal-attack-unit'&&<label>Unidade adversária
       <select value={heroTargetUnitId}
        onChange={e=>setHeroTargetUnitId(e.target.value)}>
        <option value="">Escolha uma unidade</option>
        {battle.units.filter(u=>u.side!==
         (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.side&&
          !['destroyed','surrendered','escaped'].includes(u.condition)).map(u=>
         <option key={u.id} value={u.id}>{u.name}</option>)}
       </select>
      </label>}
      {['personal-attack','personal-cautious-attack','personal-charge'].includes(heroAction)&&
       !heroRanged&&(battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.meleeWeapon?.grapple&&
       <label className="got-check"><input type="checkbox"
        checked={heroTryGrapple} onChange={e=>setHeroTryGrapple(e.target.checked)}/>
        Agarrar ao acertar (Luta vs Atletismo passivo)
       </label>}
      {heroAction==='personal-counterattack'&&
       <label className="got-check"><input type="checkbox" checked={counterAgainstCharge}
        onChange={e=>setCounterAgainstCharge(e.target.checked)}/>
        Preparar contra carga (arma de Luta, +2 dano básico quando o ataque for uma carga)
       </label>}
      {['personal-attack','personal-attack-unit','personal-counterattack',
       'personal-attack-mount','personal-cautious-attack'].includes(heroAction)&&<label className="got-check">
       <input type="checkbox" checked={heroRanged} onChange={e=>setHeroRanged(e.target.checked)}/>
       Atacar usando Pontaria (distâncias pessoais em metros)</label>}
      {['personal-attack','personal-cautious-attack',
       'personal-reckless-attack','personal-charge','personal-attack-unit'].includes(heroAction)&&
       (!heroRanged||['personal-reckless-attack','personal-charge'].includes(heroAction))&&
       (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.meleeWeapon?.adaptable&&
       <label className="got-check"><input type="checkbox" checked={heroGripTwoHands}
        onChange={e=>setHeroGripTwoHands(e.target.checked)}/>
        Adaptável · usar as duas mãos (+1 dano básico)
       </label>}
      {['personal-attack','personal-cautious-attack',
       'personal-reckless-attack','personal-charge','personal-attack-unit'].includes(heroAction)&&
       (heroRanged&&!['personal-charge','personal-reckless-attack'].includes(heroAction)?
        (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.rangedWeapon?.powerful:
        (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.meleeWeapon?.powerful)&&
       <label>Dados bônus investidos em Força (Poderosa)
        <input type="number" min={0}
         max={(battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.strengthBonusDice??0}
         value={heroPowerBonus}
         onChange={e=>setHeroPowerBonus(Math.max(0,Math.min(
          (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.strengthBonusDice??0,
          Number(e.target.value))))}/>
       </label>}
      {['personal-attack','personal-cautious-attack',
       'personal-reckless-attack','personal-charge'].includes(heroAction)&&
       (!heroRanged||['personal-reckless-attack','personal-charge'].includes(heroAction))&&
       (battle.heroes.find(h=>h.id===heroId)??battle.heroes[0])?.meleeWeapon?.stunning&&
       <label className="got-check"><input type="checkbox" checked={heroStunHit}
        onChange={e=>setHeroStunHit(e.target.checked)}/>
        Atordoante · sacrificar 1 grau de sucesso para bloquear a próxima ação maior
       </label>}
      {['personal-move','personal-trample','personal-control-mount'].includes(heroAction)&&<>
       <label>X em metros (quadrados de 1 m)
        <input type="number" min={0} max={battle.width*10-1} value={heroMetres.x}
         onChange={e=>setHeroMetres(v=>({...v,x:Number(e.target.value)}))}/></label>
       <label>Y em metros
        <input type="number" min={0} max={battle.height*10-1} value={heroMetres.y}
         onChange={e=>setHeroMetres(v=>({...v,y:Number(e.target.value)}))}/></label>
      </>}
      {['personal-free-mount','personal-escape-entangle'].includes(heroAction)&&<label>Habilidade para se libertar
       <select value={mountEscapeSkill}
        onChange={e=>setMountEscapeSkill(e.target.value as 'athletics'|'agility')}>
        <option value="athletics">Atletismo</option>
        <option value="agility">Agilidade</option>
       </select>
      </label>}
      {['join','rally','revive'].includes(heroAction)&&<label>Unidade aliada
       <select value={heroUnitId} onChange={e=>setHeroUnitId(e.target.value)}>
        <option value="">Escolha uma unidade</option>
        {battle.units.filter(u=>u.side===(battle.heroes.find(h=>h.id===heroId)??
         battle.heroes[0])?.side).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
       </select>
      </label>}
     </div>
     {battle.personalInitiative?.phase===battle.phase&&
      <p role="status">Iniciativa pessoal · rodada {Math.min(5,battle.personalInitiative.roundIndex+1)}/5 ·
       {personalTurnHeroId(battle)?' Vez de '+battle.heroes.find(h=>h.id===personalTurnHeroId(battle))?.name:
        ' ações da janela concluídas'}
      </p>}
     <p className="battle-note">Montarias e armas: {battle.heroes.filter(h=>!h.squadId).map(h=>
       h.name+': '+(h.mounted?'montado em '+h.mount?.name:
        h.mount?.health===0?'cavalo morto':h.mount?'cavalo disponível':'a pé')+
       (h.mount?' · cavalo '+h.mount.health+'/'+h.mount.maxHealth+' Saúde':'')+
       (h.pinnedByMount?' · PRESO sob montaria':'')+
       (h.prone?' · caído':'')+
       (h.rangedWeapon?.reload?' · '+(h.rangedLoaded===false?'recarregar':'arma carregada'):'')+
       (h.counterattackReady?' · contra-ataque preparado':'')+
       (h.stunnedNextTurn?' · ATORDOADO':'')+
       (h.meleeWeaponBroken?' · ARMA DE LUTA QUEBRADA':'')+
       (h.grabbedBy?' · AGARRADO':'')+
       (h.grapplingTargetId?' · AGARRANDO':'')+
       (h.entangledBy?' · ENREDADO':'')+
       (h.impaledBy?' · EMPALADO':'')+
       (h.impalingTargetId?' · EMPALANDO':'')+
       (h.meleeWeaponDisarmed?' · DESARMADO':'')+
       (h.pinnedByHero?' · IMOBILIZADO':'')+
       (h.pinningTargetId?' · MANTÉM IMOBILIZAÇÃO':'')+
       (h.impalePinnedBy?' · PRESO POR EMPALAR':'')+
       (h.offhandWeapon?' · secundária '+h.offhandWeapon.label+
        (h.offhandDefenseSuppressed?' (Defesa suspensa)':' (Defesa ativa)'):'')).join(' | ')}</p>
     <p className="battle-note">Posições individuais: {battle.heroes.map(h=>
      h.name+' ('+(h.personalPosition?.x??h.position.x*10+5)+','+
      (h.personalPosition?.y??h.position.y*10+5)+' m; '+
      h.usedActions+'/5 rodadas; '+(h.minorActionsUsed??0)+'/2 menores)').join(' · ')}</p>
     <div className="got-config-grid">
      <Button variant="outline" onClick={heroInitiative}
       disabled={Boolean(battle.personalInitiative?.phase===battle.phase)}>
       Rolar iniciativa pessoal (Agilidade + Rapidez)
      </Button>
      {battle.personalInitiative?.phase===battle.phase&&
       <Button variant="outline" onClick={heroDelay}
        disabled={Boolean(battle.pendingPersonalDamage)||!personalTurnHeroId(battle)}>
        Atrasar turno pessoal
       </Button>}
      <Button onClick={heroDo} disabled={Boolean(battle.pendingPersonalDamage)}>Executar ação individual</Button>
      <Button variant="outline" onClick={heroFinish} disabled={Boolean(battle.pendingPersonalDamage)}>Concluir cinco rodadas · avançar</Button>
     </div>
    </section>}
   <div className={'got-columns'+(mapExpanded?' got-wide':'')}>
    <section className="battle-surface got-map-panel" aria-label="Mapa em quadrados">
     <div className="got-map-header">
      <h3>Tabuleiro · 10 metros por quadrado</h3>
      <Button variant="outline" onClick={()=>setMapExpanded(x=>!x)}>
       {mapExpanded?'Restaurar painel lado a lado':'Ampliar o mapa de batalha'}
      </Button>
     </div>
     <p>Clima: {battle.weather} · Visibilidade: {battle.visibility} · Formações avançadas: {battle.advancedFormations?'sim':'não'}</p>
     <p className="battle-note">Terreno do treino: terreno selecionado é destacado no mapa.</p>
     <div className="got-map" style={{gridTemplateColumns:'repeat('+battle.width+',minmax(0,1fr))'}}>
      {Array.from({length:battle.width*battle.height},(_,i)=>{
       const x=i%battle.width,y=Math.floor(i/battle.width);
       const occupant=battle.units.find(u=>u.position.x===x&&u.position.y===y&&
        !['destroyed','escaped','surrendered'].includes(u.condition));
       const isDestination=coord.x===x&&coord.y===y;
       const terrain=battle.tiles.find(t=>t.x===x&&t.y===y)?.terrain??'plain';
       return <button key={i} type="button"
        data-terrain={terrain}
        className={'got-cell'+(occupant?' occupied '+occupant.side:'')+(isDestination?' destination':'')+(pathSquares.has(x+':'+y)?' got-route':'')+(terrain!=='plain'?' got-terrain':'')}
        aria-label={'Quadrado '+x+','+y+' · '+terrain+(occupant?' · '+occupant.name+' · '+CONDITION[occupant.condition]:'')}
        title={occupant?.name??terrain+' · '+x+','+y}
        onClick={()=>{
         setCoord({x,y});
         if(occupant){
          if(occupant.side===battle.turn)setSelected(occupant.id);
          else setTarget(occupant.id);
         }
        }}>
        {occupant?<><strong>{occupant.side==='attacker'?'A':'D'}</strong><small>{occupant.name.split(' ')[0]}</small></>:
         <span className="got-cell-dot" aria-hidden="true">{terrain==='plain'?'·':'▥'}</span>}
       </button>;
      })}
     </div>
     {inspectedTile&&inspectedEffect&&<div className="got-map-inspector" aria-live="polite">
      <strong>Quadrado {coord.x},{coord.y} · {inspectedTile.terrain}</strong>
      <span>Custo: {terrainMoveCost(inspectedTile,battle.visibility,battle.weather)*10} m de marcha
       · Cobertura contra tiros: +{terrainCoverBonus(inspectedTile,true,false)} Defesa
       · {inspectedEffect.blocked?'Bloqueado para marcha terrestre':'Terreno transitável'}</span>
      <span>Clima/visibilidade: penalidade de {visibilityPenalty(battle.visibility,battle.weather,true)} dado(s) para Pontaria</span>
      {legalKind==='move'&&movePreview&&<span className={movePreview.legal?'got-legal':'got-illegal'}>
       {movePreview.legal?'Rota disponível: '+movePreview.distanceMetres+
        ' m percorridos, '+movePreview.costMetres+' / '+movePreview.budgetMetres+
        ' m de orçamento':'Destino indisponível: '+movePreview.reason}
      </span>}
     </div>}
     <p className="battle-note">Toque em um quadrado para indicar o destino ou selecionar uma tropa.
      Tropas destruídas ou fora de campo não ocupam mais quadrados.</p>
    </section>
    <section className="battle-surface got-order-panel" aria-label="Dar ordem de guerra">
     <h3>Comando e Disciplina</h3>
     {battle.phase==='siege'&&<div className="got-order-fields">
      <p>Passo 5 · Armas de cerco. Uma ordem dispara até Guerra máquinas;
       cada unidade de engenheiros opera até quatro. A arma precisa pular a rodada seguinte
       para recarregar.</p>
      {battle.siege.filter(w=>w.side===battle.turn&&w.health>0).map(w=><p key={w.id}>
       <strong>{w.name}</strong> · munição {w.ammo} · alcance {WAR_SIEGE_CATALOG[w.kind].rangeMetres} m
       · última rodada disparada {w.lastFiredRound??'nenhuma'}</p>)}
      {battle.siege.some(w=>w.side===battle.turn&&w.health>0)&&
       <label>Tipo de alvo
        <select value={siegeTargetMode}
         onChange={e=>setSiegeTargetMode(e.target.value as 'unit'|'fort'|'hero')}>
         <option value="unit">Unidade militar</option>
         <option value="fort">Fortificação / muralha</option>
         <option value="hero">Personagem (apenas escorpião)</option>
        </select>
       </label>}
      {siegeTargetMode==='fort'&&
       <label>Fortificação inimiga
        <select value={siegeFortId}
         onChange={e=>setSiegeFortId(e.target.value)}>
         <option value="">Selecionar fortificação</option>
         {battle.fortifications.filter(f=>f.side!==battle.turn&&!f.breached)
          .map(f=><option key={f.id} value={f.id}>{f.name} · integridade {
           f.structuralHealth??'padrão do modelo'}</option>)}
        </select>
       </label>}
      {siegeTargetMode==='hero'&&<label>Personagem inimigo
       <select value={siegeHeroId} onChange={e=>setSiegeHeroId(e.target.value)}>
        <option value="">Selecionar personagem</option>
        {battle.heroes.filter(h=>h.active&&h.side!==battle.turn&&!h.unitId)
         .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
       </select>
      </label>}
      {siegeTargetMode==='unit'&&battle.siege.some(w=>w.side===battle.turn&&w.health>0)&&<label>Alvo da arma de cerco
       <select aria-label="Alvo de cerco" value={selectedTarget?.id??''}
        onChange={e=>setTarget(e.target.value)}>
        {enemy.map(u=><option key={u.id} value={u.id}>{u.name} · Saúde {u.health}/{u.maxHealth}</option>)}
       </select></label>}
      {battle.siege.some(w=>w.side===battle.turn&&w.health>0)&&
       <Button onClick={()=>siegeAction(true)}>Disparar arma de cerco</Button>}
      <Button variant="outline" onClick={()=>siegeAction(false)}>Sem disparos · prosseguir</Button>
     </div>}
     {battle.phase==='orders'&&commander&&selectedUnit?<div className="got-order-fields">
      <p><strong>{commander.name}</strong> · Guerra {commander.warfare} ·
       {battle.ordersRemaining[commander.id]??0} ordem(ns) disponível(is)</p>
      <label>Unidade comandada
       <select aria-label="Unidade comandada" value={selectedUnit.id}
        onChange={e=>setSelected(e.target.value)}>
        {activeUnits.map(u=><option key={u.id} value={u.id}>{u.name} · {CONDITION[u.condition]}</option>)}
       </select>
      </label>
      <p>Disciplina atual: <strong>{warUnitSummary(selectedUnit).discipline+
       selectedUnit.issuedThisRound*3}</strong> ·
       {selectedUnit.issuedThisRound} ordem(ns) recebida(s) nesta rodada</p>
      <label>Ordem
       <select aria-label="Ordem do livro" value={legalKind}
        onChange={e=>setKind(e.target.value as WarOrderKind)}>
        {Object.entries(ORDER_LABEL).filter(([id])=>selectedUnit.condition==='routed'?
         id==='revive':id!=='revive'&&(id!=='reorganize'||selectedUnit.condition==='disorganized'))
         .filter(([id])=>battle.advancedFormations||
          !['formation','turn','reverse','suppress','probe','counter-charge','sabotage','ambush','join','push','split-attack','lightning-attack','trample','envelop','scorched-earth','pincer','hammer-anvil','climb-walls'].includes(id))
         .map(([id,label])=><option key={id} value={id}>{label}</option>)}
       </select>
      </label>
      {legalKind==='ready'&&<div className="got-config-grid">
       <label>Disparar prontidão quando
        <select aria-label="Condição da prontidão" value={readyTrigger}
         onChange={e=>setReadyTrigger(e.target.value as typeof readyTrigger)}>
         <option value="enemy-adjacent">Inimigo entrar em quadrado adjacente</option>
         <option value="enemy-routed">Unidade inimiga debandar</option>
        </select>
       </label>
       <label>Reação preparada
        <select aria-label="Reação da prontidão" value={readyReaction}
         onChange={e=>setReadyReaction(e.target.value as typeof readyReaction)}>
         <option value="attack">Atacar</option><option value="move">Mover</option>
        </select>
       </label>
       {readyReaction==='attack'&&<label className="got-check">
        <input type="checkbox" checked={ranged}
         onChange={e=>setRanged(e.target.checked)}/>
        Ataque de Pontaria (quando equipada)</label>}
      </div>}
      {legalKind==='attack'&&battle.heroes.some(h=>h.side!==battle.turn&&h.active&&!h.unitId)&&
       <label className="got-check">
        <input type="checkbox" checked={attackHeroWithUnit}
         onChange={e=>setAttackHeroWithUnit(e.target.checked)}/>
        Alvejar herói individual (+2D para a unidade)
       </label>}
      {legalKind==='attack'&&attackHeroWithUnit&&<label>Herói adversário
       <select value={unitTargetHeroId} onChange={e=>setUnitTargetHeroId(e.target.value)}>
        <option value="">Selecione um herói</option>
        {battle.heroes.filter(h=>h.side!==battle.turn&&h.active&&!h.unitId)
         .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
       </select>
      </label>}
      {['attack','charge','aggressive-retreat','suppress','probe','ambush','push','envelop','split-attack','pincer','hammer-anvil','fire-special'].includes(legalKind)&&
       !(legalKind==='attack'&&attackHeroWithUnit)&&<>
       <label>Alvo
        <select aria-label="Alvo da ordem" value={selectedTarget?.id??''}
         onChange={e=>setTarget(e.target.value)}>
         {enemy.map(u=><option key={u.id} value={u.id}>{u.name} · {warUnitSummary(u).health}</option>)}
        </select>
       </label>
       {['attack','aggressive-retreat','ambush','split-attack'].includes(legalKind)&&<label className="got-check">
        <input type="checkbox" checked={ranged} onChange={e=>setRanged(e.target.checked)}/>
        Usar Pontaria (quando houver arma à distância)</label>}
      </>}
      {legalKind==='split-attack'&&<>
       <label>Segundo inimigo
        <select aria-label="Segundo alvo dividido" value={advancedSecondTarget}
         onChange={e=>setAdvancedSecondTarget(e.target.value)}>
         <option value="">Selecione</option>
         {enemy.filter(u=>u.id!==selectedTarget?.id).map(u=>
          <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
       </label>
       <label>Dados de teste do primeiro alvo (restante para segundo)
        <input type="number" min={1}
         max={Math.max(1,(ranged?selectedUnit.ability.marksmanship:selectedUnit.ability.fighting)-1)}
         value={advancedFirstDice} onChange={e=>setAdvancedFirstDice(Number(e.target.value))}/>
       </label>
       <p className="battle-note">Distribuição exata das graduações; dados de bônus ficam zerados
        neste controle inicial. Cada inimigo exige alcance válido.</p>
      </>}
      {['pincer','hammer-anvil'].includes(legalKind)&&<>
       <label>Segunda unidade aliada
        <select aria-label="Unidade aliada da manobra" value={advancedAllyId}
         onChange={e=>setAdvancedAllyId(e.target.value)}>
         <option value="">Selecionar automaticamente</option>
         {activeUnits.filter(u=>u.id!==selectedUnit.id).map(u=>
          <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
       </label>
       {legalKind==='pincer'&&<label>Dados de Guerra do primeiro comando
        <input type="number" min={1} max={Math.max(1,commander.warfare-1)}
         value={pincerFirstWarfare}
         onChange={e=>setPincerFirstWarfare(Number(e.target.value))}/>
       </label>}
      </>}
      {legalKind==='climb-walls'&&<label>Dificuldade de escalada (Narrador)
       <input type="number" min={3} max={30} value={wallDifficulty}
        onChange={e=>setWallDifficulty(Number(e.target.value))}/>
      </label>}
      {legalKind==='scorched-earth'&&<label>Domínio afetado (apenas prévia)
       <input value={scorchedDomain} placeholder="Nome ou identificador do domínio"
        onChange={e=>setScorchedDomain(e.target.value)}/>
      </label>}
      {legalKind==='breach-gate'&&<>
       <label>Portão de fortificação inimiga
        <select value={siegeFortId} onChange={e=>setSiegeFortId(e.target.value)}>
         <option value="">Selecionar fortificação</option>
         {battle.fortifications.filter(f=>f.side!==battle.turn&&!f.breached)
          .map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
       </label>
       <label>Dificuldade de Atletismo para arrombar
        <input type="number" min={1} max={30} value={wallDifficulty}
         onChange={e=>setWallDifficulty(Number(e.target.value))}/>
       </label>
      </>}
      {legalKind==='sabotage'&&<label>Fortificação inimiga
       <select value={battle.fortifications.find(f=>f.side!==battle.turn)?.id??''}
        disabled aria-label="Fortificação alvo da sabotagem">
        {battle.fortifications.filter(f=>f.side!==battle.turn).map(f=>
         <option key={f.id} value={f.id}>{f.name}</option>)}
       </select>
      </label>}
      {legalKind==='join'&&<p className="battle-note">
       Junção: o segundo agrupamento aliado será escolhido automaticamente entre as
       unidades disponíveis. Ambas devem estar feridas e adjacentes.</p>}
      {battle.advancedFormations&&legalKind==='formation'&&<label>Formação
       <select value={formation} onChange={e=>setFormation(e.target.value as WarFormation)}>
        {Object.keys(WAR_FORMATIONS).map(id=><option key={id} value={id}>{id}</option>)}
       </select></label>}
      {battle.advancedFormations&&legalKind==='turn'&&<label>Direção
       <select value={facing} onChange={e=>setFacing(e.target.value as WarFacing)}>
        <option value="north">Norte</option><option value="east">Leste</option>
        <option value="south">Sul</option><option value="west">Oeste</option>
       </select></label>}
      {(legalKind==='move'||legalKind==='lightning-attack'||legalKind==='trample'||
       (legalKind==='ready'&&readyReaction==='move'))&&<>
       <label>Coluna X <input type="number" min={0} max={battle.width-1} value={coord.x}
        onChange={e=>setCoord(v=>({...v,x:Number(e.target.value)}))}/></label>
       <label>Linha Y <input type="number" min={0} max={battle.height-1} value={coord.y}
        onChange={e=>setCoord(v=>({...v,y:Number(e.target.value)}))}/></label>
       {legalKind==='move'&&<label className="got-check"><input type="checkbox" checked={sprint}
        onChange={e=>setSprint(e.target.checked)}/> Correr (linha reta)</label>}
      </>}
      <Button onClick={order} disabled={(battle.ordersRemaining[commander.id]??0)<1}>
       Emitir ordem · testar Guerra
      </Button>
     </div>:<p>As ordens terminaram ou a batalha está concluída.</p>}
     {battle.phase==='orders'&&<Button variant="outline" onClick={endRound}>
      Concluir rodada · ordens contínuas
     </Button>}
     <h4>Tropas no campo</h4>
     <div className="got-roster">{battle.units.map(u=><div className="got-unit" key={u.id}>
      <strong>{u.name}</strong><span>{SIDE[u.side]} · {CONDITION[u.condition]}</span>
      <span>Saúde {u.health}/{u.maxHealth} · Defesa {u.defendRoll??u.defense} · VA {u.armor}</span>
      <span>Disciplina {warUnitSummary(u).discipline} · Desorganizações {u.disorganizations}</span>
      {u.hidden&&<span>Posição oculta · disponível para emboscada</span>}
      {u.fieldEquipment&&<span>Equipamento: {WAR_FIELD_EQUIPMENT[u.fieldEquipment].label}
       {u.fieldEquipmentConsumed?' · usado/abandonado':''}</span>}
      {u.burning&&<span>Incendiada · {u.burning.damagePerRound} dano/rodada por
       {u.burning.remainingRounds} rodada(s) restante(s)</span>}
      {battle.advancedFormations&&<span>Formação {u.formation} · Direção {u.facing}</span>}
     </div>)}</div>
    </section>
   </div>
   {battle.phase==='finished'&&<section className="battle-surface got-after" aria-label="Prévia de sobreviventes">
    <h3>Resultado pós-batalha · somente projeção</h3>
    <p className="battle-note">A tabela de sobreviventes é calculada com dados auditáveis. Nenhuma perda,
     glória ou mudança de treinamento é aplicada às fichas oficiais das Casas.</p>
    <p>Glória proposta: Atacante {aftermath?.glory.attacker} ·
     Defensor {aftermath?.glory.defender}.</p>
    {aftermath&&<div className="got-after-summary">
     {(['attacker','defender'] as const).map(side=><div className="got-unit" key={side}>
      <strong>{SIDE[side]} · balanço militar</strong>
      <span>Início: {aftermath.summary[side].originalUnits} · Organizadas: {aftermath.summary[side].organized}
       · Desorganizadas: {aftermath.summary[side].disorganized}</span>
      <span>Debandadas/retiradas: {aftermath.summary[side].routedOrEscaped}
       · Rendidas: {aftermath.summary[side].surrendered}
       · Destruídas: {aftermath.summary[side].destroyedInBattle}</span>
      <span>Proposta: {aftermath.summary[side].proposedDestroyed} destruições ·
       {aftermath.summary[side].trainingAdvanced} melhorias ·
       {aftermath.summary[side].trainingReduced} reduções</span>
      <span>Glória: {aftermath.gloryBreakdown[side].victory} vitória +
       {aftermath.gloryBreakdown[side].outnumberedBonus} desvantagem numérica +
       {aftermath.gloryBreakdown[side].defeatConsolation} consolação =
       {aftermath.glory[side]}</span>
     </div>)}
    </div>}
    <label>Filtrar resultados das tropas
     <select value={aftermathSide}
      onChange={e=>setAftermathSide(e.target.value as 'all'|WarSide)}>
      <option value="all">Ambos os exércitos</option>
      <option value="attacker">Atacante</option>
      <option value="defender">Defensor</option>
     </select>
    </label>
    <div className="got-roster">
     {(aftermath?.survivors??[]).filter(row=>aftermathSide==='all'||row.side===aftermathSide).map(row=><div className="got-unit" key={row.unitId}>
      <strong>{row.unitName}</strong><span>Condição: {row.condition} · 1d6 = {row.die}
       · resultado ajustado {row.adjusted}</span>
      <span>Treinamento: {row.steps==='destroyed'?'proposta de destruição':
       row.steps===0?'inalterado':row.steps>0?'+'+row.steps+' graduação(ões)':
       row.steps+' graduação(ões)'}</span>
      <span>Proposta: {row.training} → {row.proposedTraining} · decisão pendente do Narrador
       {row.extraRanksAfterElite>0?' · '+row.extraRanksAfterElite+' graduação(ões) extras após Elite':''}</span>
     </div>)}
    </div>
    <h4>Recursos e domínio · proposta do passo 11</h4>
    {Boolean(battle.scorchedPreview?.length)&&<div className="got-roster">
     <h4>Terra Arrasada · proprietário dos domínios</h4>
     <p className="battle-note">Sem dono declarado, perdas de recursos não são atribuídas.</p>
     {[...new Set((battle.scorchedPreview??[]).map(row=>row.domainId))].map(domain=>
      <label key={domain}>{domain}
       <select value={resourceScenario.scorchedDomainOwners?.[domain]??''}
        onChange={e=>setResourceScenario(s=>{
         const owners={...s.scorchedDomainOwners};
         if(!e.target.value)delete owners[domain];
         else owners[domain]=e.target.value as WarSide;
         return {...s,scorchedDomainOwners:owners};
        })}>
        <option value="">Atribuição pendente</option>
        <option value="attacker">Atacante</option>
        <option value="defender">Defensor</option>
       </select>
      </label>)}
    </div>}
    <p className="battle-note">Aproximação digital das consequências do livro.
     Não altera saldos, posses ou a situação oficial de nenhuma Casa.</p>
    <div className="got-config-grid">
     <label className="got-check"><input type="checkbox"
      checked={resourceScenario.occupiedDomain}
      onChange={e=>setResourceScenario(s=>({...s,occupiedDomain:e.target.checked}))}/>
      O vencedor ocupou um domínio do derrotado
     </label>
     {resourceScenario.occupiedDomain&&<>
      <label className="got-check"><input type="checkbox"
       checked={resourceScenario.garrisonHeldForThreeMonths}
       onChange={e=>setResourceScenario(s=>({...s,
        garrisonHeldForThreeMonths:e.target.checked}))}/>
       A guarnição manteve o domínio por três meses
      </label>
      <label className="got-check"><input type="checkbox"
       checked={resourceScenario.domainHasCommunityOrFort}
       onChange={e=>setResourceScenario(s=>({...s,
        domainHasCommunityOrFort:e.target.checked}))}/>
       O domínio contém comunidade ou fortaleza
      </label>
      <label>Investimento em Terras transferido
       <input type="number" min={0} max={10000}
        value={resourceScenario.capturedLandValue}
        onChange={e=>setResourceScenario(s=>({...s,
         capturedLandValue:Math.max(0,Math.trunc(Number(e.target.value)||0))}))}/>
      </label>
      <label>Defesa da fortaleza sobrevivente
       <input type="number" min={0} max={10000}
        value={resourceScenario.survivingFortDefenseValue}
        onChange={e=>setResourceScenario(s=>({...s,
         survivingFortDefenseValue:Math.max(0,Math.trunc(Number(e.target.value)||0))}))}/>
      </label>
      <label>Investimentos em Riqueza transferidos
       <input type="number" min={0} max={10000}
        value={resourceScenario.transferredWealthInvestments}
        onChange={e=>setResourceScenario(s=>({...s,
         transferredWealthInvestments:Math.max(0,Math.trunc(Number(e.target.value)||0))}))}/>
      </label>
     </>}
    </div>
    {projectedResources&&<div className="got-roster">
     {(['attacker','defender'] as const).map(side=>{
      const delta=projectedResources[side];
      return <div className="got-unit" key={side}>
       <strong>{SIDE[side]} · variação proposta</strong>
       <span>Lei {delta.law>=0?'+':''}{delta.law} ·
        População {delta.population>=0?'+':''}{delta.population}</span>
       <span>Riqueza {delta.wealth>=0?'+':''}{delta.wealth} ·
        Terras {delta.land>=0?'+':''}{delta.land} ·
        Defesa {delta.defense>=0?'+':''}{delta.defense}</span>
      </div>;
     })}
     <p>Prisioneiros: {projectedResources.captured.length?
      projectedResources.captured.map(h=>h.name+' (Status '+h.status+
       ', resgate proposto '+h.ransomWealth+' Riqueza)').join(' · '):
      'nenhum registrado'}.</p>
     <p className="battle-note">{projectedResources.notes.join(' ')}</p>
     {projectedResources.provisionalOccupationTransfer?
      <p role="status" className="got-review-alert">Ocupação não consolidada: Terras e Defesa condicionais.</p>:null}
     {projectedResources.unresolvedScorchedDomains.length>0?
      <p role="status" className="got-review-alert">Terra Arrasada sem proprietário:
       {projectedResources.unresolvedScorchedDomains.join(', ')}.</p>:null}
    </div>}
   </section>}
   <section className="battle-surface got-events" aria-label="Histórico de rolagens">
    <h3>Registro auditável da batalha</h3>
    <label>Filtrar histórico
     <select value={eventFilter} onChange={e=>setEventFilter(e.target.value as typeof eventFilter)}>
      <option value="all">Todas as ações</option>
      <option value="attacker">Somente atacante</option>
      <option value="defender">Somente defensor</option>
      <option value="dice">Somente ações com dados</option>
     </select>
    </label>
    <p className="battle-note">Mostrando as últimas {battleEvents.length} ações do filtro selecionado,
     em ordem de resolução. O histórico integral permanece no salvamento local.</p>
    <ol>{battleEvents.map(event=><li key={event.seq}>
     <strong>#{event.seq} · R{event.round}</strong> {event.text}
     {event.roll&&<small> · Dados [{event.roll.join(', ')}]</small>}
    </li>)}</ol>
    <Button variant="outline" onClick={()=>setBattle(null)}>Nova simulação</Button>
   </section>
  </>}
  {error&&<p role="alert" className="got-error">{error}</p>}
 </section>;
}
