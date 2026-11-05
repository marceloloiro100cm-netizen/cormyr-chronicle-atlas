import type {BattleStack,Side} from '../domain/types';
import {commander,commanderAppliesTo,type CommanderId} from './commanders';

/** Progresso apenas da Cruzada de treino, sem XP de personagens oficiais. */
export const V3_COMMANDER_RULE_VERSION='V3-COMMANDER-1' as const;
export const V3_COMMANDER_LEVEL_XP=[0,100,250,450,700] as const;
export type V3TalentKind='battlecraft'|'fortitude'|'march'|'signature';
export type V3TalentId=`${CommanderId}:${V3TalentKind}`;
export type V3CommanderProgress=Readonly<{
 rulesVersion:typeof V3_COMMANDER_RULE_VERSION;
 xp:number;
 selectedTalents:readonly V3TalentId[];
}>;
export type V3Talent=Readonly<{
 id:V3TalentId;name:string;description:string;kind:V3TalentKind;
 minLevel:number;
}>;
const theme:Readonly<Record<CommanderId,Readonly<{
 battlecraft:string;fortitude:string;march:string;signature:string;
}>>>={
 tillet:{battlecraft:'Estratégia de Arabel',fortitude:'Escudos do Preceptor',march:'Marcha dos Aprendizes',signature:'Voz do Instrutor'},
 noble:{battlecraft:'Dever dos Estandartes',fortitude:'Juramento Protetor',march:'Corte em Movimento',signature:'Comando dos Vassalos'},
 knight:{battlecraft:'Lança Juramentada',fortitude:'Armadura de Honra',march:'Galope do Immerflow',signature:'Segunda Investida'},
 'war-mage':{battlecraft:'Fórmula de Guerra',fortitude:'Barreira de Mystra',march:'Passo Rúnico',signature:'Círculo dos Sete Véus'},
 'purple-dragon':{battlecraft:'Doutrina de Suzail',fortitude:'Escudos Púrpura',march:'Coluna Real',signature:'Ordem da Coroa'},
 ranger:{battlecraft:'Precisão da Patrulha',fortitude:'Refúgio Verde',march:'Trilha Oculta',signature:'Sinal do Falcão'},
 priest:{battlecraft:'Zelo de Helm',fortitude:'Manto do Guardião',march:'Peregrinação',signature:'Vigília Redobrada'},
 engineer:{battlecraft:'Cálculo de Cerco',fortitude:'Bastião Improvisado',march:'Estrada dos Sitiantes',signature:'Duas Demolições'},
 quartermaster:{battlecraft:'Ofensiva Provisionada',fortitude:'Estoques Protegidos',march:'Comboio Rápido',signature:'Abundância de Waukeen'},
 'ashkar-raider':{battlecraft:'Gume da Fênix',fortitude:'Cinzas Resistentes',march:'Passos na Areia',signature:'Segundo Rugido'},
};
const TALENT_KINDS:readonly V3TalentKind[]=['battlecraft','fortitude','march','signature'];
export function v3CommanderLevel(xp:number):number {
 if(!Number.isSafeInteger(xp)||xp<0)throw new Error('XP de treino inválido.');
 let level=1;
 for(let i=1;i<V3_COMMANDER_LEVEL_XP.length;i++){
  if(xp>=V3_COMMANDER_LEVEL_XP[i]!)level=i+1;
 }
 return level;
}
export function v3NewCommanderProgress():V3CommanderProgress {
 return {rulesVersion:V3_COMMANDER_RULE_VERSION,xp:0,selectedTalents:[]};
}
export function v3CommanderTalents(id:CommanderId):readonly V3Talent[]{
 const t=theme[id];
 if(!t)throw new Error('Comandante desconhecido.');
 return TALENT_KINDS.map((kind,i)=>({
  id:`${id}:${kind}` as V3TalentId,name:t[kind],kind,minLevel:i+2,
  description:kind==='battlecraft'?'+1 de ataque para tropas da especialidade do comandante.':
   kind==='fortitude'?'+1 de defesa para tropas da especialidade do comandante.':
   kind==='march'?'+1 hexágono de movimento para tropas da especialidade do comandante.':
   'Aumenta de 1 para 2 as utilizações do poder tático do comandante por batalha.',
 }));
}
export function v3ProgressValid(id:CommanderId,progress:V3CommanderProgress):boolean{
 if(progress.rulesVersion!==V3_COMMANDER_RULE_VERSION)return false;
 if(!Number.isSafeInteger(progress.xp)||progress.xp<0)return false;
 const level=v3CommanderLevel(progress.xp);
 if(progress.selectedTalents.length>level-1)return false;
 const names=new Set(progress.selectedTalents);
 if(names.size!==progress.selectedTalents.length)return false;
 const available=v3CommanderTalents(id);
 return progress.selectedTalents.every(t=>available.some(entry=>entry.id===t&&entry.minLevel<=level));
}
export function v3AwardCommanderXp(progress:V3CommanderProgress,amount:number):V3CommanderProgress {
 if(progress.rulesVersion!==V3_COMMANDER_RULE_VERSION||!Number.isSafeInteger(progress.xp)||progress.xp<0)
  throw new Error('Versão ou XP de treinamento inválidos.');
 if(!Number.isSafeInteger(amount)||amount<1||amount>250)throw new Error('Recompensa de treino inválida.');
 return {...progress,xp:Math.min(999999,progress.xp+amount)};
}
export function v3ChooseCommanderTalent(id:CommanderId,progress:V3CommanderProgress,
 talentId:V3TalentId):V3CommanderProgress{
 if(!v3ProgressValid(id,progress))throw new Error('Registro de treinamento incompatível.');
 const talent=v3CommanderTalents(id).find(t=>t.id===talentId);
 if(!talent)throw new Error('Talento pertence a outro comandante.');
 if(progress.selectedTalents.includes(talentId))throw new Error('Talento já adquirido.');
 const level=v3CommanderLevel(progress.xp);
 if(level<talent.minLevel||progress.selectedTalents.length>=level-1)
  throw new Error('Nível ou pontos de talento insuficientes.');
 return {...progress,selectedTalents:[...progress.selectedTalents,talentId]};
}
export function v3ApplyCommanderTalent(stack:BattleStack,id:CommanderId,
 progress:V3CommanderProgress|undefined):BattleStack{
 if(!progress)return stack;
 if(!v3ProgressValid(id,progress))throw new Error('Comandante possui progressão inválida.');
 if(!commanderAppliesTo(stack,commander(id).passive.category))return stack;
 let next=stack;
 if(progress.selectedTalents.includes(`${id}:battlecraft`))
  next={...next,attack:Math.min(15,next.attack+1)};
 if(progress.selectedTalents.includes(`${id}:fortitude`))
  next={...next,defense:Math.min(15,next.defense+1)};
 if(progress.selectedTalents.includes(`${id}:march`))
  next={...next,movementHex:Math.min(6,next.movementHex+1)};
 return next;
}
export function v3CommanderPowerLimit(id:CommanderId,
 progress?:V3CommanderProgress):number{
 if(progress&&!v3ProgressValid(id,progress))throw new Error('Progressão inválida.');
 return progress?.selectedTalents.includes(`${id}:signature`)?2:1;
}
export function v3TrainingReward(winner:Side|null,side:Side,round:number):number{
 if(!Number.isSafeInteger(round)||round<0)throw new Error('Rodada inválida.');
 return Math.min(200,(winner===side?120:winner===null?90:70)+Math.min(50,round*5));
}
