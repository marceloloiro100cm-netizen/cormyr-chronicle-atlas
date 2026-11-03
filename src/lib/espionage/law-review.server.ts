/** Narrator-only Law provenance. This is intentionally pure and does not expose
 * target HouseState in any player-facing projection.
 */
import {balances} from '@/lib/house/engine';
import type {HouseState} from '@/lib/house/types';
import {spyLawSnapshotSchema,type SpyLawSnapshot} from './difficulty.server';

export function deriveVerifiedSpyHouseLaw(
 state:HouseState,sourceVersion:number,expectedTargetHouseId:string,
):SpyLawSnapshot{
 const unresolved:SpyLawSnapshot={targetId:expectedTargetHouseId,kind:'unresolved',
  law:null,sourceVersion:null,sourceRef:null};
 if(!expectedTargetHouseId.trim()||state.houseId!==expectedTargetHouseId||
  state.phase!=='active'||!Number.isInteger(sourceVersion)||sourceVersion<1){
  return spyLawSnapshotSchema.parse(unresolved);
 }
 // The official House engine, NOT raw state.base.law, includes history, region,
 // family effects and approved missive consequences.
 const law=balances(state).total.law;
 if(!Number.isInteger(law)||law<0||law>100000)return spyLawSnapshotSchema.parse(unresolved);
 return spyLawSnapshotSchema.parse({
  targetId:expectedTargetHouseId,kind:'player_house_total',
  law,sourceVersion,sourceRef:'noble_house_sheets:'+expectedTargetHouseId+':v'+sourceVersion,
 });
}

export function pendingSpyLaw(targetId:string):SpyLawSnapshot{
 return spyLawSnapshotSchema.parse({targetId,kind:'unresolved',
  law:null,sourceVersion:null,sourceRef:null});
}
