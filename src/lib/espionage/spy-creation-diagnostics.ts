/**
 * Map only known, account-safe spy recruitment failures to useful messages.
 * SQL error details may include identifiers; never show raw database errors.
 */
export type SpyCreationProblem=
 'location_unapproved'|'network_unavailable'|'no_vacancies'|
 'portrait_unavailable'|'wealth_insufficient'|'unauthorized'|
 'campaign_calendar'|'unconfirmed';

const messages:Record<SpyCreationProblem,string>={
 location_unapproved:'A Rede de Espiões está ativa, mas o domínio ainda não possui localização homologada. Informe o Narrador para regularizar a localização antes de recrutar.',
 network_unavailable:'A Rede de Espiões selecionada não está ativa ou deixou de pertencer à Casa. Atualize as vagas e tente novamente.',
 no_vacancies:'A Rede de Espiões está sem vagas. Consulte as vagas atualizadas antes de criar outro agente.',
 portrait_unavailable:'A foto selecionada ficou indisponível ou já foi reservada. Escolha outra foto livre.',
 wealth_insufficient:'A Casa não possui Riqueza suficiente para as melhorias selecionadas. Revise as melhorias e tente novamente.',
 unauthorized:'A criação não foi autorizada para esta Casa. Verifique seu acesso com o Narrador.',
 campaign_calendar:'O calendário da campanha não está disponível ou está inconsistente. O Narrador precisa regularizar a data.',
 unconfirmed:'Não foi possível confirmar a criação do espião. Atualize as vagas e confira o cadastro antes de repetir a ação.',
};

export class SpyCreationError extends Error{
 constructor(public readonly reason:SpyCreationProblem){
  super(messages[reason]);this.name='SpyCreationError';
 }
}

/** Sanitized allowlist: a duplicate key is not automatically a portrait conflict. */
export function classifySpyCreationFailure(input:{message:string;code?:string}):SpyCreationError{
 const message=input.message||'';
 if(/dom[ií]nio de recrutamento sem localiza[cç][aã]o homologada/i.test(message))
  return new SpyCreationError('location_unapproved');
 if(/fonte ativa da rede de espi[oõ]es n[aã]o encontrada|ficha operacional da casa necess[aá]ria/i.test(message))
  return new SpyCreationError('network_unavailable');
 if(/rede sem vaga livre|sem vaga livre para recrutamento/i.test(message))
  return new SpyCreationError('no_vacancies');
 if(/retrato indispon[ií]vel|selecione um retrato|spy_agent_portrait_campaign_unique|spy_agent_portrait_house_unique/i.test(message)||
   (input.code==='23505'&&/portrait_id|spy_agent_portrait/i.test(message)))
  return new SpyCreationError('portrait_unavailable');
 if(/riqueza insuficiente|saldo de riqueza insuficiente|sem riqueza|recursos insuficientes/i.test(message))
  return new SpyCreationError('wealth_insufficient');
 if(/cria[cç][aã]o de agente n[aã]o autorizada|recrutamento n[aã]o autorizado|permission denied|jwt|unauthoriz/i.test(message))
  return new SpyCreationError('unauthorized');
 if(/hub temporal indispon[ií]vel|data de campanha inv[aá]lida/i.test(message))
  return new SpyCreationError('campaign_calendar');
 return new SpyCreationError('unconfirmed');
}
