import type { HouseState } from './types';

export function editDomain(state:HouseState,id:string,name:string,notes:string):HouseState {
 const domain=state.domains.find(x=>x.id===id);
 if(!domain)throw new Error('Domínio não encontrado.');
 if(!name.trim()||name.trim().length>160||notes.length>4000)throw new Error('Nome ou notas inválidos.');
 const next=structuredClone(state),target=next.domains.find(x=>x.id===id)!;
 target.name=name.trim();target.notes=notes;
 return next;
}
export function deleteEmptyDomain(state:HouseState,id:string):HouseState {
 if(state.phase!=='draft')throw new Error('Remoção permitida somente durante o rascunho.');
 const domain=state.domains.find(x=>x.id===id);
 if(!domain)throw new Error('Domínio não encontrado.');
 if(domain.terrain||domain.community||domain.features.length||
 state.holdings.some(h=>h.domainId===id)||state.units.some(u=>u.domainId===id)||
 (state.vassals??[]).some(v=>v.domainId===id)||
 state.projects.some(p=>state.holdings.some(h=>h.id===p.holdingId&&h.domainId===id)))
 throw new Error('Domínio já possui investimentos, tropas ou vínculos. Não é possível apagar.');
 const next=structuredClone(state);next.domains=next.domains.filter(x=>x.id!==id);return next;
}
