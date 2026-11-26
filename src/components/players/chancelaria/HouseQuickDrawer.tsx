import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@/lib/visual-preview/server-fn';
import {loadHouseHub} from '@/lib/house/house.functions';
import {balances} from '@/lib/house/engine';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import {campaignMonth} from '@/lib/house/regions';
import {HouseMark,Icon} from '@/components/players/narrator/narrator-ui';

type QuickHouse={id:string;name:string;region:string|null;crest:string|null;lord_name:string|null;castle:string|null};

/**
 * Gaveta rápida "Minha Casa" dentro da Chancelaria do jogador.
 * Consulta o mesmo cache React Query ['noble-house', houseId] da Ficha
 * para que o jogador confira saldos, Corte, Exército e obras sem sair da carta.
 */
export function HouseQuickDrawer({house,onClose,onOpenSheet}:{
 house:QuickHouse;
 onClose:()=>void;
 onOpenSheet?:((houseId:string)=>void)|undefined;
}){
 const load=useServerFn(loadHouseHub);
 const query=useQuery({
  queryKey:['noble-house',house.id],
  queryFn:()=>load({data:{houseId:house.id}}),
  staleTime:60_000,
  retry:false,
 });
 const state=query.data?.state??null;
 const bal=state?balances(state):null;
 const activeProjects=state?state.projects.filter(p=>p.status==='building'):[];
 const courtList=state?.court??[];
 const unitList=state?.units??[];
 const deficits=bal?RESOURCE_KEYS.filter(k=>bal.available[k]<0):[];

 return <aside className="chn-panel chn-house-drawer" aria-label="Resumo rápido da minha Casa">
  <div className="chn-ph">
   <span className="chn-ph-t">Minha Casa</span>
   <span className="chn-spacer"/>
   <button type="button" className="chn-btn chn-btn--sm chn-btn--ghost chn-drawer-close" aria-label="Fechar resumo da Casa" onClick={onClose}>
    <Icon name="close" size={15}/>
   </button>
  </div>
  <div className="chn-hd-body">
   <div className="chn-hcard-head">
    <HouseMark house={house} size="lg"/>
    <div>
     <h3>Casa {house.name}</h3>
     <p>{[house.lord_name,house.castle,house.region].filter(Boolean).join(' · ')||'Casa nobre de Cormyr'}</p>
    </div>
   </div>

   {query.isPending&&<p className="chn-muted" role="status">Consultando dados da Casa…</p>}
   {query.isError&&<p className="chn-muted" role="alert">Não foi possível consultar os saldos agora.</p>}

   {state&&bal&&<>
    <div className="chn-box">
     <h5>Recursos disponíveis</h5>
     {deficits.length>0&&<p className="chn-hd-warn">Em déficit: {deficits.map(k=>RESOURCE_NAMES[k]).join(', ')}</p>}
     <div className="chn-hd-res">
      {RESOURCE_KEYS.map(k=><div key={k} className={'chn-hd-res-item'+(bal.available[k]<0?' chn-hd-res-item--neg':'')}>
       <span>{RESOURCE_NAMES[k]}</span>
       <b>{bal.available[k]}</b>
      </div>)}
     </div>
    </div>

    <div className="chn-box">
     <h5>Corte ({courtList.length})</h5>
     {courtList.length
      ?<ul className="chn-hd-list">
       {courtList.slice(0,8).map(c=><li key={c.id}><b>{c.name}</b>{c.role?` · ${c.role}`:''}</li>)}
       {courtList.length>8&&<li className="chn-muted">+{courtList.length-8} outro(s) membro(s)</li>}
      </ul>
      :<p className="chn-muted">Nenhum membro cadastrado na Corte.</p>}
    </div>

    <div className="chn-box">
     <h5>Exército ({unitList.length})</h5>
     {unitList.length
      ?<ul className="chn-hd-list">
       {unitList.slice(0,8).map(u=><li key={u.id}><b>{u.name}</b>{u.types.length?` · ${u.types.join(', ')}`:''}{u.training?` (${u.training})`:''}{u.destroyed?' · destruída':''}</li>)}
       {unitList.length>8&&<li className="chn-muted">+{unitList.length-8} outra(s) unidade(s)</li>}
      </ul>
      :<p className="chn-muted">Nenhuma unidade militar registrada.</p>}
    </div>

    {activeProjects.length>0&&<div className="chn-box">
     <h5>Projetos em andamento ({activeProjects.length})</h5>
     <ul className="chn-hd-list">
      {activeProjects.map(p=><li key={p.id}><b>{p.name}</b> · previsão {campaignMonth(p.start+p.duration+p.modifier)}</li>)}
     </ul>
    </div>}
   </>}

   {onOpenSheet&&<button type="button" className="chn-btn chn-btn--primary chn-btn--sm" onClick={()=>onOpenSheet(house.id)}>
    <Icon name="file" size={15}/>Abrir Ficha completa
   </button>}
  </div>
 </aside>;
}
