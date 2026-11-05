import type { Training } from './types';
export type BattleTypeId =
  | 'support' | 'archers' | 'scouts' | 'cavalry' | 'criminals' | 'crusaders'
  | 'engineers' | 'special' | 'personal-guard' | 'garrison' | 'guerrillas'
  | 'infantry' | 'sailors' | 'mercenaries' | 'warships' | 'levies' | 'raiders';
export type TacticalProfile = Readonly<{
  id: BattleTypeId; name: string; role: string; hpPerSoldier: number;
  damagePerSoldier: number; attackBase: number; defenseBase: number;
  armorBase: number; movementHex: number; rangeHex: number;
  moraleModifier: number; landEnabled: boolean;
}>;
const raw = [
  ['support','Apoio','Suporte',8,1,2,2,0,3,1,0],
  ['archers','Arqueiros','Tiro longo',8,1,3,2,2,3,4,0],
  ['scouts','Batedores','Exploração',8,1,3,3,2,4,4,0],
  ['cavalry','Cavalaria','Choque',25,7,4,4,5,5,1,0],
  ['criminals','Criminosos','Linha leve',8,1,2,2,1,3,1,-10],
  ['crusaders','Cruzados','Linha disciplinada',11,2,4,4,3,3,1,10],
  ['engineers','Engenheiros','Suporte técnico',9,1,2,3,2,3,1,0],
  ['special','Especial','Perfil genérico',10,2,3,3,2,3,1,0],
  ['personal-guard','Guarda pessoal','Elite defensiva',12,2,4,5,6,3,1,10],
  ['garrison','Guarnição','Defesa',11,2,3,4,3,2,1,5],
  ['guerrillas','Guerrilheiros','Tiro curto',8,1,3,3,1,4,2,0],
  ['infantry','Infantaria','Linha',10,2,3,3,3,3,1,0],
  ['sailors','Marinheiros','Linha leve terrestre',9,1,3,3,0,3,1,0],
  ['mercenaries','Mercenários','Linha treinada',11,2,4,3,4,3,1,0],
  ['levies','Plebeus recrutados','Linha frágil',8,1,2,2,0,3,1,-10],
  ['raiders','Saqueadores','Ataque móvel',9,2,4,2,2,4,1,0],
] as const;
export const LAND_PROFILES: readonly TacticalProfile[] = raw.map(
  ([id,name,role,hpPerSoldier,damagePerSoldier,attackBase,defenseBase,armorBase,movementHex,rangeHex,moraleModifier]) =>
    Object.freeze({id,name,role,hpPerSoldier,damagePerSoldier,attackBase,defenseBase,armorBase,movementHex,rangeHex,moraleModifier,landEnabled:true}),
);
export const NAVAL_PROFILE: TacticalProfile = Object.freeze({
  id:'warships',name:'Navios de guerra',role:'Naval',hpPerSoldier:0,damagePerSoldier:0,
  attackBase:0,defenseBase:0,armorBase:0,movementHex:0,rangeHex:0,moraleModifier:0,landEnabled:false,
});
export const BATTLE_PROFILES: readonly TacticalProfile[] = Object.freeze([...LAND_PROFILES,NAVAL_PROFILE]);
export const TRAINING_BONUS: Readonly<Record<Training, number>> = Object.freeze({green:0,trained:1,veteran:2,elite:3});
export function tacticalProfile(typeId: string): TacticalProfile {
  const found=BATTLE_PROFILES.find(p=>p.id===typeId);
  if(!found)throw new Error('Tipo de unidade não reconhecido.');
  if(!found.landEnabled)throw new Error('Navios de guerra não podem combater na arena terrestre.');
  return found;
}
