import type {ReactNode} from 'react';
import {CormyrSignature} from '../cormyr-signature';
import {
  BookOpen, CalendarDays, Castle, Crown, Feather, Home,
  Landmark, LogOut, Mail, Settings2, ShieldCheck,
} from 'lucide-react';

export type FirebaseOfficialModule =
  'inicio'|'hub'|'casas'|'missivas'|'calendario'|'jornal'|'administracao'|'meu-acesso';
export type FirebaseCampaignRole='narrador'|'jogador'|'editor';

const MODES={
  inicio:{label:'Painel principal',subtitle:'Visão geral da campanha',icon:Home},
  hub:{label:'HUB Temporal',subtitle:'Data e rodada oficial',icon:CalendarDays},
  casas:{label:'Casas nobres',subtitle:'Fichas, exércitos e domínios',icon:Castle},
  missivas:{label:'Missivas',subtitle:'Correspondência da campanha',icon:Mail},
  calendario:{label:'Calendário',subtitle:'Crônicas do tempo',icon:BookOpen},
  jornal:{label:'A Folha Sem Selo',subtitle:'Redação e edições',icon:Feather},
  administracao:{label:'Administração',subtitle:'Acervo e revisão do Narrador',icon:Landmark},
  'meu-acesso':{label:'Meu acesso',subtitle:'Permissões e diagnósticos',icon:ShieldCheck},
} as const;

export function firebaseOfficialModules(role:FirebaseCampaignRole|null):FirebaseOfficialModule[]{
  if(role==='narrador')
    return ['inicio','hub','casas','missivas','calendario','jornal','administracao','meu-acesso'];
  if(role==='editor')
    return ['inicio','jornal','calendario','meu-acesso'];
  if(role==='jogador')
    return ['inicio','casas','missivas','calendario','jornal','meu-acesso'];
  return [];
}

const roleText:Record<FirebaseCampaignRole,string>={
  narrador:'Conselho do Narrador',
  jogador:'Casa nobre',
  editor:'Editor-chefe',
};

export function FirebaseOfficialFrame({
  profile,active,onSelect,onSignOut,children,
}:{
  profile:FirebaseCampaignRole|null;
  active:FirebaseOfficialModule;
  onSelect:(value:FirebaseOfficialModule)=>void;
  onSignOut:()=>void;
  children:ReactNode;
}){
  const allowed=firebaseOfficialModules(profile);
  const current=allowed.includes(active)?active:'inicio';
  const subtitle=MODES[current].subtitle;
  return <div className="firebase-official">
    <header className="firebase-official-top">
      <a className="firebase-official-brand" href="/cormyr/index.html"
        aria-label="Atlas de Cormyr: voltar ao reino">
        <CormyrSignature subtitle="Casas Nobres · Segunda Temporada"/>
      </a>
      <div className="firebase-official-top-actions">
        <a href="/cormyr/index.html" className="firebase-official-kingdom">O Reino de Cormyr</a>
        {profile&&<>
          <span className="firebase-official-profile"><Crown aria-hidden="true" size={15}/>
            {roleText[profile]}</span>
          <button type="button" onClick={onSignOut} className="firebase-official-exit">
            <LogOut aria-hidden="true" size={15}/> Sair
          </button>
        </>}
      </div>
    </header>
    {!profile?<main className="firebase-official-auth">{children}</main>:
      <div className="firebase-official-layout">
        <aside className="firebase-official-sidebar">
          <div className="firebase-official-seal" aria-hidden="true"><Crown size={27}/></div>
          <p className="firebase-official-sidebar-kicker">SALA DO CONSELHO</p>
          <p className="firebase-official-sidebar-role">{roleText[profile]}</p>
          <span className="firebase-official-sidebar-rule" aria-hidden="true"/>
          <nav aria-label="Navegação oficial da campanha" className="firebase-official-menu">
            {allowed.map(key=>{
              const entry=MODES[key];
              const Icon=entry.icon;
              return <button key={key} type="button" className="firebase-official-menu-item"
                aria-current={current===key?'page':undefined}
                onClick={()=>onSelect(key)}>
                <Icon aria-hidden="true" size={18}/>
                <span>{entry.label}</span>
              </button>;
            })}
          </nav>
          <div className="firebase-official-sidebar-bottom">
            <span className="firebase-official-ornament" aria-hidden="true">✦</span>
            <span>“Crônicas de um reino em movimento.”</span>
          </div>
        </aside>
        <main className="firebase-official-main">
          <div className="firebase-official-pagehead">
            <p className="firebase-official-breadcrumb">
              ATLAS DE CORMYR <span aria-hidden="true">/</span> {MODES[current].label.toUpperCase()}
            </p>
            <h1>{MODES[current].label}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="firebase-official-pagecontent">{children}</div>
        </main>
      </div>}
  </div>;
}

export function FirebaseOfficialHome({
  profile,onSelect,mailAvailable,hasCalendar,hasHouses,
}:{
  profile:FirebaseCampaignRole;
  onSelect:(value:FirebaseOfficialModule)=>void;
  mailAvailable:boolean;
  hasCalendar:boolean;
  hasHouses:boolean;
}){
  const cards=firebaseOfficialModules(profile).filter(
    key=>!['inicio','meu-acesso'].includes(key));
  const isNarrator=profile==='narrador';
  return <section className="firebase-official-home" aria-label="Painel principal da campanha">
    <div className="firebase-official-hero">
      <div>
        <p className="firebase-official-hero-kicker">SEGUNDA TEMPORADA · CORMYR</p>
        <h2>{isNarrator?'Bem-vindo ao Conselho, Narrador':
          profile==='editor'?'A redação está aberta':'Bem-vindo à sua Casa nobre'}</h2>
        <p>{isNarrator?'Organize as Casas, defina o tempo da campanha e conduza as crônicas do reino.':
          profile==='editor'?'Escreva, revise e organize as edições de A Folha Sem Selo.':
          'Consulte os registros da sua Casa e acompanhe as crônicas de Cormyr.'}</p>
        <button type="button" className="firebase-official-hero-cta"
          onClick={()=>onSelect(isNarrator?'hub':profile==='editor'?'jornal':'casas')}>
          {isNarrator?'Configurar o HUB Temporal':
            profile==='editor'?'Abrir a redação':'Acessar minha Casa'}
        </button>
      </div>
      <div className="firebase-official-hero-insignia" aria-hidden="true">
        <img src="/cormyr/brand/cormyr-brasao.svg" alt=""/>
      </div>
    </div>
    <div className="firebase-official-quickstats" aria-label="Resumo dos serviços">
      <div><ShieldCheck aria-hidden="true" size={19}/><span>Identidade Firebase confirmada</span></div>
      <div><CalendarDays aria-hidden="true" size={19}/>
        <span>{hasCalendar?'Calendário disponível':'Calendário temporariamente indisponível'}</span></div>
      {profile!=='editor'&&<div><Mail aria-hidden="true" size={19}/>
        <span>{mailAvailable?'Envio de Missivas disponível':'Correspondência em preparação'}</span></div>}
    </div>
    <h2 className="firebase-official-section-title">Áreas do Conselho</h2>
    <div className="firebase-official-cards">
      {cards.map(key=>{
        const {label,subtitle,icon:Icon}=MODES[key];
        return <button type="button" key={key}
          className="firebase-official-destination"
          onClick={()=>onSelect(key)}>
          <span className="firebase-official-destination-icon"><Icon size={24} aria-hidden="true"/></span>
          <span className="firebase-official-destination-title">{label}</span>
          <span className="firebase-official-destination-subtitle">
            {key==='casas'&&!hasHouses?'Acervo temporariamente indisponível':subtitle}
          </span>
          <span className="firebase-official-destination-go">Acessar <span aria-hidden="true">→</span></span>
        </button>;
      })}
    </div>
    <button type="button" className="firebase-official-settings-link"
      onClick={()=>onSelect('meu-acesso')}>
      <Settings2 aria-hidden="true" size={16}/> Consultar meu acesso e diagnósticos
    </button>
  </section>;
}
