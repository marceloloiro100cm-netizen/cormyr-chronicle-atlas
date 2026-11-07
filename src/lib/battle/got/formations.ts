/** Capítulo 10, pp. 238–239: formações e orientação são regras avançadas opcionais. */
export type WarFormation=
 'battle'|'column'|'wedge'|'phalanx'|'shield-wall'|'square'|'tortoise'|'mob'|'checkerboard';
export type WarFacing='north'|'east'|'south'|'west';
export type WarFormationModifier=Readonly<{
 difficulty:number;meleeDefense:number;rangedDefense:number;meleePenalty:number;
 chargeBonus:number;meleeBonusAgainstMob:number;discipline:number;
 move:'normal'|'slow'|'very-slow'|'immobile';
 negateCharge:boolean;flankImmunity:boolean;noAttack:boolean;
}>;
const basics:WarFormationModifier={difficulty:0,meleeDefense:0,rangedDefense:0,
 meleePenalty:0,chargeBonus:0,meleeBonusAgainstMob:0,discipline:0,
 move:'normal',negateCharge:false,flankImmunity:false,noAttack:false};
export const WAR_FORMATIONS:Readonly<Record<WarFormation,WarFormationModifier>>={
 battle:{...basics,move:'slow'},
 column:{...basics,meleePenalty:1},
 wedge:{...basics,difficulty:3,chargeBonus:1,rangedDefense:-5},
 phalanx:{...basics,difficulty:6,meleeDefense:5,rangedDefense:-5,move:'very-slow'},
 'shield-wall':{...basics,difficulty:6,meleeDefense:5,move:'immobile',negateCharge:true},
 square:{...basics,difficulty:6,move:'immobile',flankImmunity:true},
 tortoise:{...basics,difficulty:9,meleeDefense:5,rangedDefense:5,move:'very-slow',noAttack:true},
 mob:{...basics,difficulty:-3,meleeDefense:-5,rangedDefense:-5,discipline:6},
 checkerboard:{...basics,rangedDefense:5,meleeBonusAgainstMob:1,discipline:3,move:'slow'},
};
export function formationAllowed(
 formation:WarFormation,options:{mounted:boolean;naval:boolean},
):boolean{
 return !(formation==='phalanx'&&(options.mounted||options.naval));
}
export type WarAngle='front'|'flank'|'rear';
export function attackAngle(
 from:{x:number;y:number},to:{x:number;y:number},facing:WarFacing,
):WarAngle{
 const dx=from.x-to.x,dy=from.y-to.y;
 const front=facing==='north'? -dy:facing==='south'?dy:facing==='east'?dx:-dx;
 const side=facing==='north'||facing==='south'?Math.abs(dx):Math.abs(dy);
 if(front<0&&Math.abs(front)>=side)return 'rear';
 if(front>0&&Math.abs(front)>=side)return 'front';
 return 'flank';
}
export function angleAttackBonus(
 angle:WarAngle,encircled:boolean,flankImmunity:boolean,
):{bonusDice:number;testDice:number}{
 if(flankImmunity)return {bonusDice:0,testDice:0};
 if(encircled){
  return angle==='front'?{bonusDice:1,testDice:0}:angle==='flank'?
   {bonusDice:0,testDice:1}:{bonusDice:0,testDice:2};
 }
 return angle==='flank'?{bonusDice:1,testDice:0}:angle==='rear'?
  {bonusDice:0,testDice:1}:{bonusDice:0,testDice:0};
}
export function formationMovement(
 baseMetres:number,formation:WarFormation,slowMetres=10,
):number{
 const type=WAR_FORMATIONS[formation].move;
 if(type==='immobile')return 0;
 return Math.max(0,baseMetres-(type==='very-slow'?20:type==='slow'?slowMetres:0));
}
