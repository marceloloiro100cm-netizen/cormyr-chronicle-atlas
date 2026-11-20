/**
 * Ficha 4c — leitura de economia operacional deve ser tão estrita quanto a
 * gravação transacional. Um overlay inconsistente NUNCA é substituído por
 * um snapshot importado silenciosamente.
 */
import {constructionStateHash} from './firebase-construction-transaction';
import {verifiedEconomicState} from './firebase-economic-readonly';
const SHA=/^[a-f0-9]{64}$/;
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<2147483647;
export function operationalHouseEconomyIsReconciled(
 source:{house_id:unknown;version:unknown;state:unknown},
 operational:unknown,snapshotId:string,
):operational is Record<string,unknown>{
 if(!SHA.test(snapshotId)||typeof source.house_id!=='string'||
    !number(source.version)||!object(source.state)||!object(operational))
  return false;
 if(operational['houseId']!==source.house_id||
    operational['status']!=='active'||operational['private']!==true||
    operational['sourceSnapshotId']!==snapshotId||
    operational['sourceReconciled']!==true||operational['seedVerified']!==true||
    operational['sourceSheetVersion']!==source.version||
    !number(operational['version'])||
    !object(operational['state'])||
    operational['state']['houseId']!==source.house_id||
    typeof operational['sourceStateHash']!=='string'||
    typeof operational['stateHash']!=='string')
  return false;
 try{
  const oldHash=constructionStateHash(source.state);
  const newHash=constructionStateHash(operational['state']);
  return operational['sourceStateHash']===oldHash&&
    operational['stateHash']===newHash&&
    (operational['version']!==0||oldHash===newHash)&&
    verifiedEconomicState(operational['state'])!==null;
 }catch{return false;}
}
