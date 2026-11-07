/** Replay V3 independente. Nunca armazena HouseState nem interpreta JSON como estado autoritativo.
 * Toda retomada reexecuta os comandos a partir de exércitos-modelo e cenário conhecidos.
 */
import {z} from 'zod';
import {battleCommandSchema} from '../domain/turns';
import {battleHash} from '../domain/replay';
import {MODEL_HOUSES} from './model-houses';
import {V3_COMMANDERS} from './commanders';
import {SCENARIOS} from '../geometry/map-fixtures';
import {createV3Game,v3PlayCommand,v3UseCommander,v3UseUnitSkill,v3RunAi,
 type V3Game,type V3Step,type V3ScenarioOptions} from './engine';

const optionsSchema=z.object({
 attackerHouseId:z.enum(MODEL_HOUSES.map(h=>h.id) as [string,...string[]]),
 defenderHouseId:z.enum(MODEL_HOUSES.map(h=>h.id) as [string,...string[]]),
 attackerCommander:z.enum(V3_COMMANDERS.map(c=>c.id) as [string,...string[]]),
 defenderCommander:z.enum(V3_COMMANDERS.map(c=>c.id) as [string,...string[]]),
 scenario:z.enum(Object.keys(SCENARIOS) as [string,...string[]]),
 opponent:z.enum(['human','ai']),
}).strict();
export const v3StepSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('COMMAND'),command:battleCommandSchema,actor:z.enum(['narrator','ai'])}).strict(),
 z.object({type:z.literal('SKILL'),skill:z.enum(['CHARGE','VOLLEY','SHIELD_WALL','AMBUSH','SAPPERS']),
  targetId:z.string().min(1).max(80).optional()}).strict(),
 z.object({type:z.literal('POWER'),targetId:z.string().min(1).max(80)}).strict(),
 z.object({type:z.literal('AI')}).strict(),
]);
const hash=z.string().regex(/^[0-9a-f]{64}$/);
const receiptSchema=z.object({
 index:z.number().int().min(1).max(1500),step:v3StepSchema,hash,
}).strict();
const replaySchema=z.object({
 format:z.literal('CCA-V3-REPLAY-1'),
 rulesVersion:z.literal('PTE-3.0-SANDBOX'),
 setup:optionsSchema,
 initialHash:hash,
 receipts:z.array(receiptSchema).max(1500),
 finalHash:hash,
}).strict();
export type V3ReplayFile=z.infer<typeof replaySchema>;
const MAX_BYTES=1_500_000;

export function applyV3ReplayStep(game:V3Game,step:V3Step):V3Game{
 if(step.type==='COMMAND'){
  if(step.actor==='ai'&&game.battle.controls[game.battle.stacks.find(
   s=>s.id===game.battle.activeUnitId)?.side??'attacker']!=='ai')
   throw new Error('Ator IA inválido na batalha V3.');
  return v3PlayCommand(game,step.command,step.actor);
 }
 if(step.type==='SKILL')return v3UseUnitSkill(game,step.skill,step.targetId);
 if(step.type==='POWER')return v3UseCommander(game,step.targetId);
 const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
 if(!active||game.battle.phase!=='active'||game.battle.controls[active.side]!=='ai')
  throw new Error('Passo de IA fora de turno na batalha V3.');
 return v3RunAi(game);
}
export function captureV3Replay(game:V3Game):V3ReplayFile{
 if(game.battle.stacks.some(s=>s.source.kind!=='fictional'))
  throw new Error('Exportação de fichas oficiais não permitida no replay V3.');
 if(game.steps.length>1500)throw new Error('Histórico V3 excede 1.500 passos.');
 let cursor=createV3Game(optionsSchema.parse(game.setup) as V3ScenarioOptions);
 const initialHash=battleHash(cursor);
 const receipts:V3ReplayFile['receipts'][number][]=[];
 for(const [index,step] of game.steps.entries()){
  cursor=applyV3ReplayStep(cursor,step);
  receipts.push({index:index+1,step,hash:battleHash(cursor)});
 }
 if(battleHash(cursor)!==battleHash(game))
  throw new Error('A partida V3 não corresponde ao histórico; exportação recusada.');
 return {format:'CCA-V3-REPLAY-1',rulesVersion:'PTE-3.0-SANDBOX',
  setup:game.setup,initialHash,receipts,finalHash:battleHash(cursor)};
}
export function verifyV3Replay(raw:unknown):{game:V3Game;file:V3ReplayFile}{
 const file=replaySchema.parse(raw);
 let game=createV3Game(file.setup as V3ScenarioOptions);
 if(battleHash(game)!==file.initialHash)
  throw new Error('Replay V3: snapshot inicial divergente.');
 for(const [i,receipt] of file.receipts.entries()){
  if(receipt.index!==i+1)throw new Error('Replay V3: numeração inválida.');
  try{game=applyV3ReplayStep(game,receipt.step as V3Step);}
  catch{throw new Error('Replay V3: comando ilegal ou incompatível.');}
  if(battleHash(game)!==receipt.hash)
   throw new Error('Replay V3: integridade do comando não confirmada.');
 }
 if(battleHash(game)!==file.finalHash)
  throw new Error('Replay V3: hash final divergente.');
 return {game,file};
}
export function exportV3ReplayJson(game:V3Game):string{
 return JSON.stringify(captureV3Replay(game),null,2);
}
export function parseV3ReplayJson(value:string):ReturnType<typeof verifyV3Replay>{
 if(value.length>MAX_BYTES)throw new Error('Replay V3 excede 1,5 MB.');
 let raw:unknown;
 try{raw=JSON.parse(value) as unknown;}
 catch{throw new Error('Arquivo V3 não contém JSON válido.');}
 return verifyV3Replay(raw);
}
