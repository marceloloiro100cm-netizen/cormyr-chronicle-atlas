import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FirebaseArmyRoster,readFirebaseMilitaryRoster} from './FirebaseArmyRoster';

afterEach(cleanup);

const primary={
  id:'u-1',name:'Lanceiros do Rio',types:['infantry'],training:'trained',
  strength:100,casualties:13,health:15,xp:60,
  commanderName:'Ser Afonso',situation:'No domínio',
  equipment:['armor','fighting'],skills:{warfare:4,endurance:3},
};
const reserve={
  id:'u-2',name:'Arqueiros da Torre',types:['archers'],
  training:'elite',strength:80,casualties:2,health:12,xp:90,
  situation:'Na muralha',skills:{marksmanship:4},
};

describe('Firebase Cloud — unidades militares por Casa',()=>{
  it('usa exatamente efetivo e baixas do snapshot e calcula totais',()=>{
    const data=readFirebaseMilitaryRoster({units:[primary,reserve]});
    expect(data.total).toBe(2);
    expect(data.active).toBe(2);
    expect(data.knownStrength).toBe(180);
    expect(data.knownAvailable).toBe(165);
    expect(data.units[0].available).toBe(87);
    expect(data.units[1].available).toBe(78);
  });

  it('apresenta unidades, comandante e habilidades sem permitir alterações',()=>{
    const {container}=render(<FirebaseArmyRoster
      houseName="Evenhand" state={{units:[primary,reserve]}}/>);
    expect(screen.getByRole('heading',{name:'Exército da Casa'})).toBeInTheDocument();
    expect(screen.getByText('Lanceiros do Rio')).toBeInTheDocument();
    expect(screen.getByText('Arqueiros da Torre')).toBeInTheDocument();
    expect(screen.getByText('Comandante: Ser Afonso')).toBeInTheDocument();
    expect(screen.getByText('87 / 100')).toBeInTheDocument();
    expect(screen.getByText('78 / 80')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Habilidades e equipamentos')[0]!);
    expect(screen.getByText('Guerra')).toBeInTheDocument();
    expect(screen.getByText('Vigor')).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });

  it('não inventa efetivo quando dados estão ausentes ou inválidos',()=>{
    const d=readFirebaseMilitaryRoster({units:[
      {...primary,casualties:130},
      {id:'broken',name:'Sem contagem',types:['unknown'],strength:null,casualties:null},
    ]});
    expect(d.knownAvailable).toBeNull();
    expect(d.knownStrength).toBeNull();
    expect(d.units[0].available).toBeNull();
    expect(d.units[1].available).toBeNull();
    expect(d.units[1].typeNames).toEqual(['unknown']);
  });

  it('unidade destruída não integra efetivo disponível',()=>{
    const d=readFirebaseMilitaryRoster({units:[
      {...primary,destroyed:true},reserve,
    ]});
    expect(d.active).toBe(1);
    expect(d.knownAvailable).toBe(78);
  });

  it('não executa texto não confiável da ficha como HTML',()=>{
    const {container}=render(<FirebaseArmyRoster
      houseName="Evenhand" state={{units:[{...primary,
        name:'<script>alert(1)</script>',
        commanderName:'<img src=x onerror=attack()>',
      }]}}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('Comandante: <img src=x onerror=attack()>'))
      .toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('limita renderização sem truncar nem modificar os dados originais',()=>{
    const units=Array.from({length:154},(_,i)=>({
      ...primary,id:'unit-'+i,name:'Unidade '+i,
    }));
    const state={units};
    const d=readFirebaseMilitaryRoster(state);
    expect(d.total).toBe(154);
    expect(d.units.length).toBe(150);
    expect(d.limited).toBe(true);
    expect(d.knownAvailable).toBeNull();
    expect(d.active).toBeNull();
    expect(state.units.length).toBe(154);
    const {container}=render(<FirebaseArmyRoster houseName="Evenhand" state={state}/>);
    expect(screen.getByRole('status')).toHaveTextContent('limite de exibição');
    expect(container.querySelectorAll('article').length).toBe(150);
  });

  it('apresenta mensagem vazia sem supor que existam tropas',()=>{
    render(<FirebaseArmyRoster houseName="Evenhand" state={{}}/>);
    expect(screen.getByText('Nenhuma unidade registrada nesta ficha.'))
      .toBeInTheDocument();
    expect(screen.getByText('Unidades cadastradas').parentElement)
      .toHaveTextContent('0');
  });
});
