/** Distinct espionage objectives: public regional reconnaissance and private
 * noble-house infiltration. The House's defense is NEVER returned in a
 * targeting selector, and simulation may not authorize a real operation.
 */
import {regionId} from '@/lib/house/regions';
import type {SpyRegionalAgent} from './region-turns';

export type SpyTargetHouse={id:string;name:string;regionId:string};
export type SpyTargetStage=
 |'select_agent'|'select_region'|'agent_unavailable'|'unknown_agent_location'
 |'requires_region_arrival'|'select_house'|'house_not_in_region'|'ready_for_house_planning';

export function spyHouseTargetStage(input:{
 agent:SpyRegionalAgent|null;selectedRegion:string;targetHouseId:string;
 houseTargets:readonly SpyTargetHouse[];simulation:boolean;
}):SpyTargetStage{
 if(!input.agent||input.simulation)return 'select_agent';
 if(!input.selectedRegion||!regionId(input.selectedRegion))return 'select_region';
 if(input.agent.status!=='available')return 'agent_unavailable';
 const actual=regionId(input.agent.currentRegion??'');
 if(!actual)return 'unknown_agent_location';
 // Never permit a regional preview to impersonate the agent's physical place.
 if(actual!==regionId(input.selectedRegion))return 'requires_region_arrival';
 if(!input.targetHouseId)return 'select_house';
 const house=input.houseTargets.find(h=>h.id===input.targetHouseId);
 if(!house||regionId(house.regionId)!==actual)return 'house_not_in_region';
 return 'ready_for_house_planning';
}
