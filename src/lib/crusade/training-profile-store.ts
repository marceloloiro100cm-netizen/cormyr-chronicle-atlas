/** Armazenamento opcional e exclusivamente local da experiência fictícia.
 * Não contém JWT, informações reais, contas ou progresso oficial de campanha.
 */
import {generalProfileFromJson,initialGeneralProfile,type TrainingGeneralProfile}
 from './general-progression';
const KEY='cca-crz-training-general-v1';
export function readGeneralTrainingProfile():TrainingGeneralProfile{
 try{
  if(typeof window==='undefined')return initialGeneralProfile();
  const saved=window.localStorage.getItem(KEY);
  return saved?generalProfileFromJson(saved):initialGeneralProfile();
 }catch{return initialGeneralProfile();}
}
export function saveGeneralTrainingProfile(profile:TrainingGeneralProfile):boolean{
 try{
  if(typeof window==='undefined')return false;
  window.localStorage.setItem(KEY,JSON.stringify(generalProfileFromJson(JSON.stringify(profile))));
  return true;
 }catch{return false;}
}
