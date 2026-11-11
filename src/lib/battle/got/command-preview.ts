import {previewWarAttack,previewWarChargeReach,previewWarMovement,previewWarOrderDifficulty} from './engine';
import {warExpectedDamage,warTestOdds,type WarOdds} from './odds';
import type {WarBattle,WarCommander,WarOrder,WarOrderKind,WarPosition,WarUnit} from './types';

/** Camada de leitura para a interface de comando: nunca rola dados nem altera a batalha. */
const fieldable=(unit:WarUnit):boolean=>
 !['destroyed','surrendered','escaped'].includes(unit.condition);

export type WarReachableCell=Readonly<{x:number;y:number;costMetres:number}>;
/** Quadrados que a ordem Mover (ou Correr) alcança agora, com a mesma rota do motor. */
export function reachableWarCells(battle:WarBattle,unitId:string,sprint=false):
 readonly WarReachableCell[]{
 const unit=battle.units.find(u=>u.id===unitId);
 if(!unit)return [];
 const cells:WarReachableCell[]=[];
 for(let y=0;y<battle.height;y++)for(let x=0;x<battle.width;x++){
  if(x===unit.position.x&&y===unit.position.y)continue;
  // Corrida exige linha reta: evita calcular rotas impossíveis.
  if(sprint&&x!==unit.position.x&&y!==unit.position.y)continue;
  const preview=previewWarMovement(battle,unitId,{x,y},sprint);
  if(preview.legal&&preview.path.length)cells.push({x,y,costMetres:preview.costMetres});
 }
 return cells;
}
export type WarTargetOption=Readonly<{
 unitId:string;position:WarPosition;
 /** Chance de acertar e dano médio; nulos quando a carga ainda precisa correr até o alvo. */
 odds:WarOdds|null;expectedDamage:number|null;
 testDice:number;bonusDice:number;penaltyDice:number;defense:number;
 baseDamage:number;targetArmor:number;
}>;
export type WarTargetMode='melee'|'ranged'|'charge';
/** Inimigos que podem ser alvo agora, com as chances reais do ataque. */
export function attackableWarTargets(battle:WarBattle,unitId:string,mode:WarTargetMode):
 readonly WarTargetOption[]{
 const actor=battle.units.find(u=>u.id===unitId);
 if(!actor)return [];
 const options:WarTargetOption[]=[];
 for(const target of battle.units){
  if(target.side===actor.side||!fieldable(target))continue;
  if(mode==='charge'){
   const reach=previewWarChargeReach(battle,unitId,target.id);
   if(!reach.legal)continue;
   // Chance do golpe final já na posição em que a corrida termina.
   const arrival=reach.destination??actor.position;
   const arrived:WarBattle={...battle,units:battle.units.map(u=>
    u.id===actor.id?{...u,position:{...arrival}}:u)};
   const preview=previewWarAttack(arrived,unitId,target.id,{charge:true});
   options.push(describe(target,preview.legal?preview:null));
   continue;
  }
  const preview=previewWarAttack(battle,unitId,target.id,{ranged:mode==='ranged'});
  if(preview.legal)options.push(describe(target,preview));
 }
 return options;
}
function describe(target:WarUnit,preview:ReturnType<typeof previewWarAttack>|null):WarTargetOption{
 if(!preview||!preview.legal)return {unitId:target.id,position:target.position,odds:null,
  expectedDamage:null,testDice:0,bonusDice:0,penaltyDice:0,defense:target.defendRoll??target.defense,
  baseDamage:0,targetArmor:target.armor};
 const odds=warTestOdds({rank:preview.testDice,bonus:preview.bonusDice,
  penalty:preview.penaltyDice,difficulty:preview.defense,modifier:preview.weatherModifier});
 return {unitId:target.id,position:target.position,odds,
  expectedDamage:warExpectedDamage(odds,preview.baseDamage,preview.targetArmor),
  testDice:preview.testDice,bonusDice:preview.bonusDice,penaltyDice:preview.penaltyDice,
  defense:preview.defense,baseDamage:preview.baseDamage,targetArmor:preview.targetArmor};
}
/** Chance de o comandante fazer a unidade obedecer (Guerra × Disciplina). */
export function warCommandOdds(battle:WarBattle,commander:WarCommander,unit:WarUnit,
 order:Pick<WarOrder,'kind'|'formation'>):Readonly<{difficulty:number;odds:WarOdds}>{
 const {difficulty}=previewWarOrderDifficulty(battle,unit,order);
 return {difficulty,odds:warTestOdds({rank:Math.min(15,Math.max(1,commander.warfare)),difficulty})};
}
export type WarQuickOrder=Readonly<{
 kind:WarOrderKind;label:string;icon:string;
 /** Explicação curta, em linguagem de mesa, do que a ordem faz. */
 help:string;
 /** O que o jogador precisa clicar no mapa depois de escolher a ordem. */
 needs:'enemy'|'cell'|'none';
 ranged?:boolean;sprint?:boolean;
 /** Identificador estável do botão (duas ordens podem compartilhar `kind`). */
 id:string;
}>;
/** Ordens básicas do Passo Sete que fazem sentido para a unidade neste momento. */
export function quickWarOrders(unit:WarUnit):readonly WarQuickOrder[]{
 if(unit.condition==='routed')return [{id:'revive',kind:'revive',label:'Reanimar',icon:'📯',
  needs:'none',help:'A tropa para de fugir e fica desorganizada. Depois, use Reorganizar.'}];
 const list:WarQuickOrder[]=[
  {id:'attack',kind:'attack',label:'Atacar',icon:'⚔️',needs:'enemy',
   help:'Luta contra um inimigo adjacente. Dano × graus de sucesso, menos a armadura.'},
 ];
 if(unit.range!=='none')list.push({id:'shoot',kind:'attack',label:'Atirar',icon:'🏹',
  needs:'enemy',ranged:true,
  help:'Pontaria até '+(unit.range==='long'?'200':'20')+' m. Não precisa encostar no inimigo.'});
 if(!unit.naval)list.push({id:'charge',kind:'charge',label:'Carga',icon:'🐎',needs:'enemy',
  help:'Corre em linha reta e ataca: −1D em Luta, +2 de dano básico.'});
 list.push({id:'move',kind:'move',label:'Mover',icon:'👣',needs:'cell',
  help:'Marcha até um quadrado verde (cada quadrado tem 10 m).'});
 if(!unit.naval)list.push({id:'run',kind:'move',label:'Correr',icon:'💨',needs:'cell',sprint:true,
  help:'Quatro vezes o Movimento, somente em linha reta.'});
 list.push({id:'defend',kind:'defend',label:'Defender',icon:'🛡️',needs:'none',
  help:'Testa Agilidade: o resultado vira a Defesa da tropa nesta rodada.'});
 if(unit.condition==='organized'&&unit.health<unit.maxHealth)
  list.push({id:'rally',kind:'rally',label:'Reagrupar',icon:'✚',needs:'none',
   help:'Recupera 1 ponto de Saúde por grau de sucesso do teste de Guerra.'});
 if(unit.condition==='disorganized')
  list.push({id:'reorganize',kind:'reorganize',label:'Reorganizar',icon:'🚩',needs:'none',
   help:'Remove todo o dano. A penalidade de +3 na Disciplina permanece.'});
 list.push({id:'retreat',kind:'retreat',label:'Retirada',icon:'↩️',needs:'none',
  help:'Recua em ordem, afastando-se do inimigo. Falha crítica causa debandada.'});
 return list;
}
