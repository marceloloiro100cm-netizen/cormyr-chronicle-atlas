import {describe,it,expect} from 'vitest';
import {EMPTY_ORIGINAL_MAIL_FILTERS,toFirebaseOriginalMailFilters,
  type OriginalMailOptions} from './firebase-original-filter-bridge';

const options:OriginalMailOptions={
  readOnly:true,verifiedViewerScope:true,
  houses:[{id:'erdenor',label:'Erdenor'},{id:'fewmerry',label:'Fewmerry'}],
  weeks:[4,3],courts:[],units:[],rounds:[{number:4,status:'open'}],
};
describe('original mail filters target exactly the historical Firebase contract',()=>{
  it('passes all unchanged filter keys and strips the presentation group',()=>{
    const values={...EMPTY_ORIGINAL_MAIL_FILTERS,box:'recebidas',
      number:'4',kind:'geral',origin:'fewmerry',house:'erdenor',
      court:'none',unit:'none',answered:'no',read:'no',text:'test',
      group:'1'};
    const result=toFirebaseOriginalMailFilters(values,options,true);
    expect(result).toMatchObject({
      box:'recebidas',number:'4',kind:'geral',origin:'fewmerry',
      house:'erdenor',court:'none',unit:'none',
      answered:'no',read:'no',text:'test',
      group_house_ids:['erdenor'],
    });
    expect(result).not.toHaveProperty('group');
  });
  it('player group cannot grant access to an arbitrary House',()=>{
    const values={...EMPTY_ORIGINAL_MAIL_FILTERS,group:'2'};
    const result=toFirebaseOriginalMailFilters(values,options,false);
    expect(result).not.toHaveProperty('group_house_ids');
    expect(result).not.toHaveProperty('group');
  });
});
