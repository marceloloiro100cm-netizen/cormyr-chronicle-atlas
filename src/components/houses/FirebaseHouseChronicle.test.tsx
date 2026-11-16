import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FirebaseHouseChronicle,readFirebaseHouseChronicle} from './FirebaseHouseChronicle';

afterEach(cleanup);
const state={
  fortunes:[{month:1522,resource:'wealth',result:16,outcome:'Fartura',
    changes:{wealth:3,law:0}}],
  actions:[{month:1522,type:'ação militar',notes:'Fortificação reforçada'}],
  vassals:[{name:'Casa da Ponte',status:'approved',loyalty:'loyal',
    influencePenalty:2,approvedMonth:1520,
    sheet:{lordName:'SEGREDO_DE_OUTRA_CASA',base:{wealth:99}}}],
};
describe('Firebase Cloud — histórico e vassalagem da Casa',()=>{
  it('exibe apenas registros da ficha própria e valores declarados',()=>{
    const d=readFirebaseHouseChronicle(state);
    expect(d.fortunes.total).toBe(1);
    expect(d.fortunes.entries[0]?.resource).toBe('Riqueza');
    expect(d.fortunes.entries[0]?.changes).toEqual([
      {name:'Lei',amount:0},{name:'Riqueza',amount:3},
    ]);
    expect(d.vassals.entries[0]?.influencePenalty).toBe(2);
    const {container}=render(<FirebaseHouseChronicle houseName="Evenhand" state={state}/>);
    fireEvent.click(screen.getByText('Eventos de Fortuna',{selector:'summary'}));
    fireEvent.click(screen.getByText('Ações da Casa'));
    fireEvent.click(screen.getByText('Vassalagem'));
    expect(screen.getByText('Fartura')).toBeInTheDocument();
    expect(screen.getByText('Riqueza: +3')).toBeInTheDocument();
    expect(screen.getByText('Fortificação reforçada')).toBeInTheDocument();
    expect(screen.getByText('Casa da Ponte')).toBeInTheDocument();
    expect(container.textContent).not.toContain('SEGREDO_DE_OUTRA_CASA');
    expect(container.querySelector('form,button,input,a,img,[contenteditable]')).toBeNull();
  });
  it('distingue registros ausentes, vazios e inválidos',()=>{
    const missing=readFirebaseHouseChronicle({});
    expect(missing.actions.total).toBeNull();
    const empty=readFirebaseHouseChronicle({actions:[],fortunes:[],vassals:[]});
    expect(empty.fortunes.total).toBe(0);
    const invalid=readFirebaseHouseChronicle({actions:{},fortunes:[null],vassals:'invalid'});
    expect(invalid.actions.invalid).toBe(true);
    expect(invalid.fortunes.invalid).toBe(true);
    expect(invalid.vassals.invalid).toBe(true);
    render(<FirebaseHouseChronicle houseName="Evenhand" state={{}}/>);
    expect(screen.getByText('Histórico de Fortuna indisponível.')).toBeInTheDocument();
    expect(screen.getByText('Histórico de ações indisponível.')).toBeInTheDocument();
    expect(screen.getByText('Vassalagem indisponível.')).toBeInTheDocument();
  });
  it('nega números não confiáveis e nunca converte strings em valores',()=>{
    const d=readFirebaseHouseChronicle({
      fortunes:[{month:-1,resource:'unknown',result:'10',changes:{wealth:'8',power:Infinity}}],
      actions:[{month:'1530',type:null,notes:'   '}],
      vassals:[{status:'approved',influencePenalty:NaN,approvedMonth:1.4}],
    });
    expect(d.fortunes.entries[0]?.month).toBeNull();
    expect(d.fortunes.entries[0]?.result).toBeNull();
    expect(d.fortunes.entries[0]?.changes).toHaveLength(0);
    expect(d.actions.entries[0]?.month).toBeNull();
    expect(d.vassals.entries[0]?.influencePenalty).toBeNull();
  });
  it('trata texto injetado como texto e não carrega URL privada',()=>{
    const {container}=render(<FirebaseHouseChronicle houseName="Evenhand" state={{
      fortunes:[{outcome:'<script>alert(1)</script>'}],
      actions:[{notes:'<img src=x onerror=attack()>'}],
      vassals:[{name:'<iframe src=https://example.invalid>'}],
    }}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=attack()>')).toBeInTheDocument();
    expect(container.querySelector('script,img,iframe')).toBeNull();
  });
  it('limita a apresentação sem perder as contagens originais',()=>{
    const fortunes=Array.from({length:42},(_,i)=>({month:i}));
    const actions=Array.from({length:62},(_,i)=>({type:String(i)}));
    const vassals=Array.from({length:45},(_,i)=>({name:String(i)}));
    const v=readFirebaseHouseChronicle({fortunes,actions,vassals});
    expect(v.fortunes.total).toBe(42);
    expect(v.fortunes.entries).toHaveLength(40);
    expect(v.actions.entries).toHaveLength(60);
    expect(v.vassals.entries).toHaveLength(40);
    expect(v.fortunes.partial&&v.actions.partial&&v.vassals.partial).toBe(true);
    const {container}=render(<FirebaseHouseChronicle houseName="Evenhand"
      state={{fortunes,actions,vassals}}/>);
    expect(container.querySelectorAll('article')).toHaveLength(140);
    container.querySelectorAll('summary').forEach(s=>fireEvent.click(s));
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });
  it('não modifica snapshots ou planilhas de vassalos',()=>{
    const input=structuredClone(state);
    readFirebaseHouseChronicle(input);
    expect(input).toEqual(state);
  });
});
