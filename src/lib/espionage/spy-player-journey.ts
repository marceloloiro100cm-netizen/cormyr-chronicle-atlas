import type {SpyIntelligenceObjective} from './spy-intelligence-rules';

export type SpyPlayerStep='agent'|'destination'|'objective';

/** Jornada puramente visual. O banco segue autorizando agentes, rotas e alvos.
 * A UI nunca transforma uma prévia em missão antes da confirmação.
 */
export function spyPlayerJourneyStep(input:{
 hasAgent:boolean;agentAvailable:boolean;hasRegion:boolean;
 hasTarget:boolean;routeReady:boolean;
}):SpyPlayerStep{
 if(!input.hasAgent||!input.agentAvailable)return 'agent';
 if(!input.hasRegion||!input.hasTarget||!input.routeReady)return 'destination';
 return 'objective';
}

/** Evita anunciar datas ou uma duração sem a prévia oficial do HUB. */
export function spyPlayerMissionSummary(input:{
 objective:SpyIntelligenceObjective;
 travelRounds:number|null;
 arrivalDate:string|null;
 endDate:string|null;
}){
 const duration=input.travelRounds===null?null:input.travelRounds+1;
 return {
  objective:input.objective,
  durationDesdias:duration,
  durationOrdinaryDays:duration===null?null:duration*10,
  travelDesdias:input.travelRounds,
  arrivalDate:input.arrivalDate,
  endDate:input.endDate,
 };
}
