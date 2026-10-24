import { balances } from './engine';
import type { HouseState, Resource } from './types';
export type SiegeItem={id:string;name:string;cost:number;resource:Resource;engineer:boolean;carrier:boolean;excludesMounted:boolean;description:string;health?:number;armor?:number;damage?:number;range?:number;movement?:number};
export const SIEGE:SiegeItem[]=[
 {id:'ram',name:'Aríete comum',cost:1,resource:'lands',engineer:false,carrier:true,excludesMounted:true,description:'Não pode atacar enquanto equipado. +2D Atletismo contra portas/portões; perdido se portador debanda ou é destruído.'},
 {id:'covered-ram',name:'Aríete coberto',cost:2,resource:'lands',engineer:true,carrier:true,excludesMounted:true,health:20,armor:8,movement:10,description:'Uma unidade de engenheiros e outra portadora. Atletismo8 contra defesas; operadores +5 Defesa.'},
 {id:'mantlets',name:'Manteletes',cost:1,resource:'wealth',engineer:false,carrier:true,excludesMounted:false,description:'Por unidade: −10m movimento e +5 Defesa contra Pontaria.'},
 {id:'turtle',name:'Tartaruga',cost:1,resource:'wealth',engineer:false,carrier:true,excludesMounted:true,movement:10,description:'Protege uma unidade: +10 Defesa, não ataca enquanto protegida. Saída exige ordem de movimento.'},
 {id:'siege-tower',name:'Torre de cerco',cost:2,resource:'wealth',engineer:false,carrier:true,excludesMounted:false,health:20,armor:8,movement:10,description:'Uma unidade ocupante,+5 Defesa,dispensa Atletismo para escalar. Saúde0 destrói torre e ocupante.'},
 ...([['small-catapult','Catapulta pequena',1,3,10,5,300,0],['large-catapult','Catapulta grande',4,7,40,5,500,0],['fire-spitter','Cospe-Fogo',2,3,20,2,200,10],['scorpion','Escorpião',1,3,10,1,500,10],['mangonel','Manganela',3,6,20,3,200,10],['trebuchet','Trabuco',4,7,40,4,500,0]] as const).map(([id,name,cost,damage,health,armor,range,movement])=>({id,name,cost,resource:'wealth' as const,engineer:true,carrier:false,excludesMounted:false,damage,health,armor,range,movement,description:id==='scorpion'?'Representa três escorpiões disparando contra um único alvo; ignora armadura.':id==='fire-spitter'?'Inclui óleo fervente; dano ignora armadura. Fogo Selvagem depende de adaptação.':'Guerra dos engenheiros contra Defesa do alvo; dano multiplicado por graus de sucesso. Dispara em rodadas alternadas.'})),
];
export function buySiege(state:HouseState,args:{id:string;itemId:string;engineerId:string;carrierId:string;domainId:string;name:string}):HouseState {
 const item=SIEGE.find(i=>i.id===args.itemId);if(!item)throw new Error('Equipamento não disponível; catapulta média exige conciliação do dano.');
 if(state.holdings.some(h=>h.id===args.id))throw new Error('Identificador já utilizado.');
 const domain=state.domains.find(d=>d.id===args.domainId);if(!domain)throw new Error('Escolha um domínio.');
 const engineer=state.units.find(u=>u.id===args.engineerId&&!u.destroyed&&u.types.includes('engineers'));
 const carrier=state.units.find(u=>u.id===args.carrierId&&!u.destroyed);
 if(item.engineer&&!engineer)throw new Error('Exige unidade de engenheiros.');
 if(item.carrier&&!carrier)throw new Error('Exige unidade portadora.');
 if(item.engineer&&item.carrier&&engineer?.id===carrier?.id)throw new Error('Exige outra unidade além dos engenheiros.');
 if(item.excludesMounted&&carrier&&(carrier.types.includes('cavalry')||carrier.types.includes('warships')))throw new Error('Portadora não pode ser cavalaria ou navios.');
 if(item.engineer&&!item.carrier&&state.holdings.filter(h=>h.status==='active'&&h.parentId===args.engineerId&&SIEGE.some(i=>i.id===h.itemId&&i.engineer&&!i.carrier)).length>=4)throw new Error('Engenheiros controlam no máximo quatro armas de cerco.');
 if(balances(state).available[item.resource]<item.cost)throw new Error('Saldo insuficiente para cerco.');
 const next=structuredClone(state);next.permanent[item.resource]-=item.cost;
 next.holdings.push({id:args.id,itemId:item.id,name:args.name||item.name,domainId:domain.id,parentId:args.engineerId||args.carrierId,costs:[{resource:item.resource,amount:item.cost,mode:'permanent'}],category:'equipment',source:'Livro básico · Equipamento especial e cerco,pp.223–230',ruleVersion:'2026-10-24',effects:[{kind:'action',description:item.description+' Operadora: '+(engineer?.name??carrier?.name??'')+'; portadora: '+(carrier?.name??'não se aplica')}],status:'active'});return next;
}