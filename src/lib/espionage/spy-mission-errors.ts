/** Mensagens seguras de envio/viagem; jamais expor SQL, UUIDs ou Casas alheias. */
export type SpyMissionProblem=
 'calendar_changed'|'agent_busy'|'agent_location'|'route_unavailable'|
 'invalid_target'|'not_authorized'|'idempotency_conflict'|'not_confirmed';

const message:Record<SpyMissionProblem,string>={
 calendar_changed:'O Hub Temporal avançou. Atualize a previsão da missão e tente novamente.',
 agent_busy:'Este espião já está em missão ou a ficha mudou. Atualize seus agentes.',
 agent_location:'A localização do espião ainda não foi homologada. Informe o Narrador.',
 route_unavailable:'Não existe rota homologada para este destino. Escolha outra região ou avise o Narrador.',
 invalid_target:'A Casa-alvo não está disponível para espionagem. Escolha outra Casa.',
 not_authorized:'Sua Casa não tem autorização para iniciar esta missão.',
 idempotency_conflict:'Esta solicitação já foi usada em outra missão. Atualize a lista de missões.',
 not_confirmed:'Não foi possível confirmar a missão. Atualize a lista de agentes antes de reenviar.',
};
export class SpyMissionError extends Error{
 constructor(readonly problem:SpyMissionProblem){super(message[problem]);this.name='SpyMissionError';}
}
export function classifySpyMissionFailure(error:{message:string;code?:string}):SpyMissionError{
 const msg=error.message??'';
 if(/Hub Temporal mudou|calend[aá]rio atualizado|vers[aã]o.*calend[aá]rio/i.test(msg))
  return new SpyMissionError('calendar_changed');
 if(/espi[aã]o indispon[ií]vel|espi[aã]o j[aá].*miss[aã]o|ficha desatualizada|agente indispon[ií]vel/i.test(msg))
  return new SpyMissionError('agent_busy');
 if(/localiza[cç][aã]o.*n[aã]o homologada|posi[cç][aã]o.*n[aã]o homologada/i.test(msg))
  return new SpyMissionError('agent_location');
 if(/n[aã]o h[aá] uma liga[cç][aã]o|trajeto regional incompleto|rota regional|regi[aã]o.*sem localiza[cç][aã]o v[aá]lida/i.test(msg))
  return new SpyMissionError('route_unavailable');
 if(/casa-alvo inv[aá]lida|casa-alvo desconhecida|casa n[aã]o pertence [aà] regi[aã]o/i.test(msg))
  return new SpyMissionError('invalid_target');
 if(/n[aã]o autorizad|permission denied|unauthoriz|jwt/i.test(msg))
  return new SpyMissionError('not_authorized');
 if(/chave da miss[aã]o j[aá] utilizada|chave de opera[cç][aã]o j[aá] utilizada|esta miss[aã]o j[aá] foi encerrada/i.test(msg))
  return new SpyMissionError('idempotency_conflict');
 return new SpyMissionError('not_confirmed');
}
