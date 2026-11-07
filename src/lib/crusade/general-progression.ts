/** P3: evolução local do General de treinamento; não é ficha de personagem.
 * A única fonte de experiência é replay CRZ verificado e encerrado.
 */
import {z} from 'zod';
import {crzVerifyReplay,type CrzReplay} from './replay';
export const GENERAL_PROGRESSION_VERSION=1 as const;
export const GENERAL_TRAINING_THRESHOLDS=[0,100,240,430,680,980,1340,1770,2270,2840] as const;
const profileSchema=z.object({
 schemaVersion:z.literal(1),generalId:z.literal('tillet-general'),
 xp:z.number().int().min(0).max(50000),
 level:z.number().int().min(1).max(10),
 replayHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(500),
}).strict();
export type TrainingGeneralProfile=z.infer<typeof profileSchema>;
export function initialGeneralProfile():TrainingGeneralProfile{
 return {schemaVersion:1,generalId:'tillet-general',xp:0,level:1,replayHashes:[]};
}
export function generalProfileFromJson(raw:string):TrainingGeneralProfile{
 if(raw.length>50000)throw new Error('Perfil de treinamento excede o limite.');
 const parsed=profileSchema.parse(JSON.parse(raw) as unknown);
 if(parsed.level!==generalTrainingLevel(parsed.xp))
  throw new Error('Perfil de treinamento possui nível incompatível com experiência.');
 if(new Set(parsed.replayHashes).size!==parsed.replayHashes.length)
  throw new Error('Replay de treinamento duplicado.');
 return parsed;
}
export function generalTrainingLevel(xp:number):number{
 if(!Number.isSafeInteger(xp)||xp<0||xp>50000)
  throw new Error('Experiência de treinamento inválida.');
 const index=[...GENERAL_TRAINING_THRESHOLDS].reverse()
  .findIndex(threshold=>xp>=threshold);
 return GENERAL_TRAINING_THRESHOLDS.length-index;
}
export function awardGeneralTraining(profile:TrainingGeneralProfile,replay:CrzReplay):{
 profile:TrainingGeneralProfile;awarded:number
}{
 const source=profileSchema.parse(profile);
 if(source.level!==generalTrainingLevel(source.xp))
  throw new Error('Perfil de treinamento inconsistente.');
 const verified=crzVerifyReplay(replay);
 if(!verified.ok)throw new Error('Replay de batalha não verificável: '+verified.error);
 const state=verified.state;
 if(state.phase!=='completed')throw new Error('Batalha de treino ainda não encerrada.');
 if(state.leaders.attacker?.id!==profile.generalId)
  throw new Error('General não pertence a este treinamento.');
 if(replay.initial.stacks.some(s=>s.source.kind!=='fictional'))
  throw new Error('Não se pode obter experiência a partir de tropas reais.');
 if(source.replayHashes.includes(verified.headHash))return {profile:source,awarded:0};
 if(source.replayHashes.length>=500)throw new Error('Limite de registros de treino alcançado.');
 const enemies=state.stacks.filter(s=>s.side==='defender');
 const kills=enemies.reduce((n,s)=>n+s.initialCount-s.alive,0);
 const earned=Math.min(150,20+Math.min(80,kills*2)+
  (state.winner==='attacker'?45:0));
 const xp=Math.min(50000,source.xp+earned);
 return {awarded:xp-source.xp,profile:{
  ...source,xp,level:generalTrainingLevel(xp),
  replayHashes:[...source.replayHashes,verified.headHash],
 }};
}
