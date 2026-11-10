import {Component,lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react';
import {ClientOnly} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
import {Minus,Plus,RotateCcw,LocateFixed} from 'lucide-react';
import type {SceneProps} from './MiniatureScene';
import type {CameraFocus} from './CameraRig';
import {
 pendingStillLegal,proposeVisualAction,tokenFocusPoint,
 type VisualPendingAction,
} from '@/lib/battle/visual3d/interaction';
import {readMiniaturePalette,type MiniaturePalette} from './palette';
import './miniatures3d.css';

const Scene=lazy(()=>import('./MiniatureScene'));
export function webGLAvailable():boolean{
 try{
  const canvas=document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2'));
 }catch{return false;}
}
class SceneBoundary extends Component<{children:ReactNode;onFailure:()=>void;fallback:ReactNode},{failed:boolean}>{
 override state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 override componentDidCatch(){this.props.onFailure();}
 override render(){return this.state.failed?this.props.fallback:this.props.children;}
}
type Props=Omit<SceneProps,'palette'|'top'|'zoom'|'reset'|'focus'|'reducedMotion'|'onReady'|'onFailure'|'pendingAction'|'onHexClick'> &{
 fallback:ReactNode;onFailure?:()=>void;onHexClick?:(hex:{q:number;r:number})=>void;
 canIssueCommands?:boolean;targetAction?:'attack'|'ability';
};
export function MiniatureViewport({fallback,onFailure,canIssueCommands=false,
 targetAction='attack',...props}:Props){
 const wrapper=useRef<HTMLDivElement>(null);
 const [palette,setPalette]=useState<MiniaturePalette|null>(null);
 const [failed,setFailed]=useState(false);const [ready,setReady]=useState(false);
 const [top,setTop]=useState(false);const [zoom,setZoom]=useState(1);
 const [reduced,setReduced]=useState(true);const [reset,setReset]=useState(0);
 const [focus,setFocus]=useState<CameraFocus|null>(null);
 const [pending,setPending]=useState<VisualPendingAction|null>(null);
 const [message,setMessage]=useState('');
 const activeToken=props.tokens.find(t=>t.id===props.activeId);
 const focusToken=props.tokens.find(t=>t.id===(props.selectedId??props.activeId));
 const actorId=props.activeId??null;
 const moveKeys=props.moveKeys??[];
 const attackKeys=props.attackKeys??[];
 const moveSignature=moveKeys.join('|'),attackSignature=attackKeys.join('|');
 const validPending=pending&&pendingStillLegal(pending,{
  tokens:props.tokens,moveKeys,attackKeys,actorId,
  actionEnabled:canIssueCommands,
 })?pending:null;
 const fail=()=>{setFailed(true);onFailure?.();};
 useEffect(()=>{
  if(!webGLAvailable()){fail();return;}
  if(wrapper.current)setPalette(readMiniaturePalette(wrapper.current));
  const query=typeof window.matchMedia==='function'?
   window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const update=()=>setReduced(Boolean(query?.matches));
  update();query?.addEventListener?.('change',update);
  return ()=>query?.removeEventListener?.('change',update);
 },[]);
 useEffect(()=>{
  if(!palette||ready||failed)return;
  const timer=setTimeout(fail,20000);return ()=>clearTimeout(timer);
 },[palette,ready,failed]);
 // Cancel an unconfirmed order when the turn, selected unit or legal actions change.
 useEffect(()=>{setPending(null);},[
  props.selectedId,props.activeId,moveSignature,attackSignature,canIssueCommands,targetAction,
 ]);
 const onCellClick=(hex:{q:number;r:number})=>{
  const candidate=proposeVisualAction({
   hex,tokens:props.tokens,moveKeys,attackKeys,
   actorId,actionEnabled:canIssueCommands,
  });
  if(candidate){
   setPending(candidate);
   setMessage(candidate.type==='move'?'Destino preparado. Confirme o movimento.':
    targetAction==='ability'?'Alvo da habilidade preparado. Confirme.':
    'Alvo marcado. Confirme o ataque.');
   return;
  }
  setPending(null);
  props.onHexClick?.(hex);
  const unit=props.tokens.find(t=>(t.footprintCells?.length?t.footprintCells:[t.position])
   .some(p=>p.q===hex.q&&p.r===hex.r));
  setMessage(unit?'Selecionado: '+unit.name:
   'Quadrado '+hex.q+','+hex.r+' selecionado.');
 };
 const confirm=()=>{
  if(!validPending)return;
  const hex=validPending.target;
  setPending(null);
  props.onHexClick?.(hex);
  setMessage('Comando enviado ao motor para validação.');
 };
 const focusOnActive=()=>{
  const t=activeToken??focusToken;
  if(!t)return;
  const point=tokenFocusPoint(props.map,t);
  setFocus(old=>({x:point.x,z:point.z,nonce:(old?.nonce??0)+1}));
  setMessage('Câmera focada em '+t.name+'.');
 };
 const allStats=focusToken?.tactical?
  Object.values(focusToken.tactical).filter((entry):entry is string=>
   typeof entry==='string'&&entry.length>0):[];
 return <div ref={wrapper} className="miniatures3d"
  data-scene-ready={ready&&!failed?'1':undefined}
  data-token-count={props.tokens.length}
  data-pending-action={validPending?.type??'none'}>
   {focusToken&&<section className="miniatures3d-selected" aria-label="Resumo tático da unidade" role="status">
    <div className="miniatures3d-selected-title">
     <strong>{focusToken.name}</strong>
     <span>{focusToken.metricLabel??'Soldados'}: {focusToken.count.toLocaleString('pt-BR')}</span>
     {focusToken.houseLabel&&<small>{focusToken.houseLabel}</small>}
     {focusToken.id===props.activeId&&<small>Unidade ativa</small>}
    </div>
    {allStats.length>0&&<div className="miniatures3d-tactical-stats">
     {allStats.map((label,i)=><span key={i}>{label}</span>)}
    </div>}
   </section>}
  {failed?<><p role="status">3D indisponível neste dispositivo. Mapa 2D preservado.</p>{fallback}</>:<>
   <div className="miniatures3d-toolbar" role="group" aria-label="Câmera do mapa 3D">
    <Button variant="outline" aria-pressed={!top} onClick={()=>setTop(false)}>Isométrica</Button>
    <Button variant="outline" aria-pressed={top} onClick={()=>setTop(true)}>Superior</Button>
    <Button variant="outline" size="icon" title="Reduzir zoom" aria-label="Reduzir zoom 3D"
     disabled={zoom<=.6} onClick={()=>setZoom(v=>Math.max(.6,+(v-.2).toFixed(2)))}><Minus/></Button>
    <Button variant="outline" size="icon" title="Ampliar zoom" aria-label="Ampliar zoom 3D"
     disabled={zoom>=2.4} onClick={()=>setZoom(v=>Math.min(2.4,+(v+.2).toFixed(2)))}><Plus/></Button>
    <Button variant="outline" size="icon" title="Centralizar mapa"
     aria-label="Centralizar câmera 3D" onClick={()=>{
      setZoom(1);setTop(false);setReset(v=>v+1);
      setMessage('Mapa centralizado.');
     }}><RotateCcw/></Button>
    <Button variant="outline" size="sm" disabled={!activeToken&&!focusToken}
     title="Ir à unidade ativa sem perder o zoom"
     aria-label="Focar unidade ativa 3D" onClick={focusOnActive}>
     <LocateFixed size={16}/> Focar tropa
    </Button>
   </div>
   <div className="miniatures3d-status-line" role="status">
    {validPending?'Ação aguardando confirmação':
     moveKeys.length||attackKeys.length?
      moveKeys.length+' movimentos · '+attackKeys.length+' alvos marcados':
      'Toque para selecionar · arraste para mover o mapa'}
    {props.routeKeys?.length?' · Rota indicada: '+props.routeKeys.length+' casas':''}
   </div>
   {validPending&&<div className="miniatures3d-action-confirm" role="group"
    aria-label="Confirmar comando 3D">
    <strong>{validPending.type==='move'?'Mover para '+validPending.label:
     targetAction==='ability'?'Usar habilidade em '+validPending.label:
     'Atacar '+validPending.label}?</strong>
    <Button onClick={confirm} size="sm">
     {validPending.type==='move'?'Confirmar movimento':
      targetAction==='ability'?'Confirmar habilidade':'Confirmar ataque'}
    </Button>
    <Button variant="outline" size="sm" onClick={()=>{
     setPending(null);setMessage('Comando cancelado.');
    }}>Cancelar</Button>
   </div>}
   {message&&<p className="miniatures3d-feedback" role="status">{message}</p>}
   <p className="miniatures3d-sr-only">Para navegação pelo teclado e leitores de tela, use Mapa 2D. No 3D, arraste para percorrer o tabuleiro. Movimentos e ataques legais exigem confirmação.</p>
   <div className="miniatures3d-viewport" aria-label="Tabuleiro quadrado com miniaturas 3D">
    {!ready&&<p role="status" className="miniatures3d-status">Preparando miniaturas…</p>}
    {palette&&<ClientOnly fallback={null}><SceneBoundary onFailure={fail} fallback={null}>
     <Suspense fallback={null}><Scene {...props} onHexClick={onCellClick}
      pendingAction={validPending} palette={palette} top={top} zoom={zoom}
      reset={reset} focus={focus} reducedMotion={reduced}
      onReady={()=>setReady(true)} onFailure={fail}/></Suspense>
    </SceneBoundary></ClientOnly>}
   </div>
  </>}
 </div>;
}
