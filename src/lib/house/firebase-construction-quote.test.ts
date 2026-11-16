import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {
  ConstructionPreviewError,previewHouseConstruction,constructionChoices,
} from './firebase-construction-quote';

function house(){
  const state=newHouseState('house-a','Helmlands',17);
  state.phase='active';
  state.base.defense=30;
  state.base.lands=40;
  state.base.wealth=20;
  state.domains=[
    {id:'domain-a',name:'Vale do Immerflow',terrain:'hills',
      features:['river'],notes:''},
    {id:'domain-b',name:'Borda do Bosque',terrain:'woods-light',
      features:[],notes:''},
  ];
  return state;
}
const request=(extra:Record<string,unknown>={})=>({
  houseId:'house-a',itemId:'tower',domainId:'domain-a',...extra,
});
describe('Firebase Cloud — simulação de posses somente leitura',()=>{
  it('calcula preço com motor de regras oficial e nunca autoriza a compra',()=>{
    const state=house();
    const original=structuredClone(state);
    const result=previewHouseConstruction(state,request(),'Evenhand',3);
    expect(result.item.name).toBe('Torre');
    expect(result.before.defense).toBe(30);
    expect(result.after.defense).toBe(20);
    expect(result.costs).toEqual([{
      resource:'defense',amount:10,mode:'allocation',
    }]);
    expect(result.errors).toEqual([]);
    expect(result.purchaseEligibleByRules).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.purchaseEnabled).toBe(false);
    expect(result.snapshotReconciliationPending).toBe(true);
    expect(result.sheetVersion).toBe(3);
    expect(state).toEqual(original);
  });
  it('aplica desconto de uma posse ativa, sem mudar os dados de origem',()=>{
    const state=house();
    state.holdings.push({
      id:'bonus',itemId:'bonus',name:'Oficina da Vila',
      domainId:'domain-a',source:'Registro da Casa',
      costs:[],effects:[{
        kind:'discount',resource:'defense',target:'tower',amount:2,
        description:'Desconto em construção',
      }],ruleVersion:'1',status:'active',
    });
    const result=previewHouseConstruction(state,request(),'Evenhand',3);
    expect(result.costs[0]?.amount).toBe(8);
    expect(result.after.defense).toBe(22);
    expect(result.discounts).toEqual([{
      source:'Oficina da Vila',resource:'defense',amount:2,
    }]);
  });
  it('bloqueia preço sem recursos suficientes sem criar saldo',()=>{
    const state=house();
    state.base.defense=5;
    const result=previewHouseConstruction(state,request(),'Evenhand',3);
    expect(result.errors.some(x=>x.includes('Saldo insuficiente'))).toBe(true);
    expect(result.after.defense).toBe(-5);
    expect(result.purchaseEligibleByRules).toBe(false);
  });
  it('não aceita Casa de outro jogador nem domínio ausente',()=>{
    const state=house();
    expect(()=>previewHouseConstruction(state,request({
      houseId:'house-b',
    }),'Evenhand',1)).toThrow(ConstructionPreviewError);
    expect(()=>previewHouseConstruction(state,request({
      domainId:'outro-domínio',
    }),'Evenhand',1)).toThrowError('domain_not_found');
  });
  it('evita reembolso de posse de outro domínio por replaceId falso',()=>{
    const state=house();
    state.holdings.push({
      id:'old-tower',itemId:'tower',name:'Outra Torre',
      domainId:'domain-b',source:'Histórico',
      costs:[{resource:'defense',amount:10,mode:'allocation'}],
      effects:[],ruleVersion:'1',status:'active',
    });
    expect(()=>previewHouseConstruction(state,request({
      replaceId:'old-tower',
    }),'Evenhand',1)).toThrowError('replacement_not_found');
    expect(()=>previewHouseConstruction(state,request({
      supportId:'old-tower',
    }),'Evenhand',1)).toThrowError('support_not_found');
  });
  it('rejeita parâmetros extras, IDs maliciosos e fonte incompleta',()=>{
    const state=house();
    for(const extra of [
      {uid:'narrator'}, {role:'narrador'},
      {houseId:'../private'}, {itemId:'../../data'},
      {replaceId:'../house-b'},
    ])expect(()=>previewHouseConstruction(state,request(extra),
      'Evenhand',1)).toThrowError('invalid_quote_request');
    const partial={...state,permanent:null};
    expect(()=>previewHouseConstruction(partial,request(),'Evenhand',1))
      .toThrowError('quote_source_unavailable');
    expect(()=>previewHouseConstruction(state,request(),'Evenhand',-1))
      .toThrowError('quote_source_unavailable');
  });
  it('não infere item inexistente, nem libera item com pendência',()=>{
    const state=house();
    expect(()=>previewHouseConstruction(state,request({
      itemId:'there-is-no-such-catalog-item',
    }),'Evenhand',1)).toThrowError('item_not_found');
    const result=previewHouseConstruction(state,request({
      itemId:'godswood',
    }),'Evenhand',1);
    expect(result.item.pending).toBeTruthy();
    expect(result.purchaseEnabled).toBe(false);
    expect(result.purchaseEligibleByRules).toBe(false);
  });
  it('catálogo oferece nomes públicos sem carregar fichas ou contas',()=>{
    expect(constructionChoices.some(x=>x.id==='tower')).toBe(true);
    expect(constructionChoices.some(x=>x.id==='castle')).toBe(true);
    expect(constructionChoices.every(x=>
      !('houseId' in x)&&!('state' in x)&&!('apiKey' in x))).toBe(true);
  });
});
