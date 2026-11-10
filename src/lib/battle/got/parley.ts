import type {WarBattle} from './types';
export type WarParleyChoice='none'|'truce-proposal'|'surrender-proposal'|'betrayal-report';
const labels:Readonly<Record<Exclude<WarParleyChoice,'none'>,string>>={
 'truce-proposal':'Proposta de trégua',
 'surrender-proposal':'Proposta de rendição',
 'betrayal-report':'Ataque durante parlamento (requer arbitragem do Narrador)',
};
/** Registro narrativo pré-rodada. NÃO resolve acordo ou penaliza Influência real.
 * Nenhuma rolagem nem mudança no HUB; apenas trilha auditável da simulação.
 */
export function recordWarParley(battle:WarBattle,choice:WarParleyChoice,terms=''):WarBattle{
 if(choice==='none')return battle;
 if(!(choice in labels)||terms.length>250)
  throw new Error('Tipo ou termos do parlamento inválidos.');
 if(battle.round!==1||battle.events.length||battle.phase==='finished')
  throw new Error('Parlamento deve ser registrado antes das ações iniciais.');
 return {...battle,events:[{
  seq:1,round:1,side:null,kind:'parley',
  text:labels[choice]+(terms.trim()?' · '+terms.trim():'')+
   '. Registro narrativo pendente de aprovação, sem afetar Influência.',
 }]};
}
