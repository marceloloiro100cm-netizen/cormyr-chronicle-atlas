import type {WarBattle,WarEvent} from './types';
import type {WarPersonalWeapon} from './personal-weapons';

/** Efeitos de qualidades de arma após acertar (cap. 9, pp. 198–200).
 * Executados depois do cálculo de dano do golpe: uma armadura partida
 * não é retroativamente subtraída do VA usado para o próprio golpe.
 */
export function applyPersonalWeaponQualities(battle:WarBattle,input:{
 actorId:string;targetId:string;weapon:WarPersonalWeapon|undefined;
 ranged:boolean;degrees:number;stunUsed?:boolean;
}):WarBattle{
 const attacker=battle.heroes.find(h=>h.id===input.actorId);
 const defender=battle.heroes.find(h=>h.id===input.targetId);
 if(!attacker||!defender)throw new Error('Combatentes não localizados.');
 const {weapon,degrees}=input;
 if(degrees<2||!weapon)return battle;
 let actor=attacker,target=defender;
 const notices:Array<{kind:string;text:string}>=[];
 if(input.stunUsed&&weapon.stunning){
  target={...target,stunnedNextTurn:true};
  notices.push({kind:'personal-stunned',text:defender.name+
   ' não poderá usar ação maior no próximo turno (Atordoante).'});
 }
 if(weapon.shattering){
  const shield=Math.max(0,target.defensiveBonus??0);
  const shieldLoss=Math.min(shield,weapon.shattering);
  const armorLoss=Math.min(Math.max(0,weapon.shattering-shieldLoss),target.armor);
  if(shieldLoss||armorLoss){
   target={...target,
    defensiveBonus:shield-shieldLoss,
    defense:Math.max(1,target.defense-shieldLoss),
    armor:target.armor-armorLoss};
   notices.push({kind:'personal-shatter',text:weapon.label+
    ' reduziu '+shieldLoss+' ponto(s) de bônus defensivo e '+
    armorLoss+' ponto(s) de VA de '+defender.name+'.'});
  }
 }
 if(weapon.fragile){
  actor={...actor,...(input.ranged?
   {rangedWeaponBroken:true}:{meleeWeaponBroken:true})};
  notices.push({kind:'personal-weapon-broken',text:weapon.label+
   ' de '+attacker.name+' quebrou por sucesso de dois ou mais graus.'});
 }
 if(notices.length===0)return battle;
 const events:WarEvent[]=notices.map((notice,index)=>({
  seq:battle.events.length+index+1,round:battle.round,side:attacker.side,
  kind:notice.kind,text:notice.text,
 }));
 return {...battle,
  heroes:battle.heroes.map(h=>h.id===actor.id?actor:h.id===target.id?target:h),
  events:[...battle.events,...events],
 };
}
