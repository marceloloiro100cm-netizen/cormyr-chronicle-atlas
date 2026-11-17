import {describe,expect,it} from 'vitest';
import {projectFirebaseDynamicTranslations as project} from './firebase-dynamic-dictionary';

describe('Traduções públicas Firebase: filtro de segurança',()=>{
  const data={
    translations:{
      'house:house_a:name':'Casa A',
      'region:region_a:name':'Região A',
      'constitution:constitution_a:title':'Carta pública',
    },
  };
  it('preserva somente chaves explicitamente públicas',()=>{
    expect(project(data)).toEqual(data.translations);
    expect(project(data,'house')).toEqual({'house:house_a:name':'Casa A'});
    expect(project(data,'region')).toEqual({'region:region_a:name':'Região A'});
  });
  it('não confere acesso a tipos privados',()=>{
    for(const type of ['record','event','adventure','catalog_item','festival']){
      expect(project(data,type)).toEqual({});
      expect(project({translations:{...data.translations,[type+':x:name']:'PRIVADO'}}))
        .toEqual({});
    }
  });
  it('bloqueia dicionários inválidos integralmente, sem exibir partes',()=>{
    for(const invalid of [
      null,{},[],{translations:[]},{translations:null},
      {translations:{'house:x:field:extra':'bad'}},
      {translations:{'house:x:field':''}},
      {translations:{'house:x:field':123}},
      {translations:{'house:../:field':'bad'}},
      {translations:{'house:x:field':'a'.repeat(12001)}},
      {translations:Object.fromEntries(Array.from({length:5001},(_,i)=>
        ['house:house_'+i+':name','X']))},
    ])expect(project(invalid)).toEqual({});
  });
  it('nunca executa acessos herdados ao dicionário',()=>{
    const inherited=Object.create({translations:{'house:a:name':'HIDDEN'}});
    expect(project(inherited)).toEqual({});
  });
});
