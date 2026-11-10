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
import {inspectVisualCell} from '@/lib/battle/visual3d/terrain-inspection';
import type {MiniaturePerfSample} from '@/lib/battle/visual3d/performance';
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
 contextLabel?:string;
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
 const [inspected,setInspected]=useState<{q:number;r:number}|null>(null);
 const [keyboardCell,setKeyboardCell]=useState('');
 const [measuring,setMeasuring]=useState(false);
 const [performanceSample,setPerformanceSample]=useState<MiniaturePerfSample|null>(null);
 const navigationCell=props.map.tiles.find(t=>t.q+','+t.r===keyboardCell)?keyboardCell:
  (props.map.tiles[0]?props.map.tiles[0].q+','+props.map.tiles[0].r:'');
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
  const timer=setTimeout(fail,8000);return ()=>clearTimeout(timer);
 },[palette,ready,failed]);
 // Cancel an unconfirmed order when the turn, selected unit or legal actions change.
 useEffect(()=>{setPending(null);},[
  props.selectedId,props.activeId,moveSignature,attackSignature,canIssueCommands,targetAction,
 ]);
 const onCellClick=(hex:{q:number;r:number})=>{
  setInspected({q:hex.q,r:hex.r});
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
  const unit=props.tokens.find(t=>(t.footprintCells?.length?t.footprintCells:[t.position])
   .some(p=>p.q===hex.q&&p.r===hex.r));
  // When commanding, empty/hostile illegal squares are inspection-only.
  // Friendly token selection and GOT planning still use the original callback.
  if(!canIssueCommands||(unit&&unit.side===activeToken?.side))
   props.onHexClick?.(hex);
  setMessage(unit?'Inspecionado: '+unit.name:
   'Quadrado '+hex.q+','+hex.r+' inspecionado.');
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
 const inspection=inspected?inspectVisualCell(props.map,props.tokens,inspected):null;
 const allStats=focusToken?.tactical?
  Object.values(focusToken.tactical).filter((entry):entry is string=>
   typeof entry==='string'&&entry.length>0):[];
 return <div ref={wrapper} className="miniatures3d"
  data-scene-ready={ready&&!failed?'1':undefined}
  data-token-count={props.tokens.length}
  data-pending-action={validPending?.type??'none'}>
   {props.contextLabel&&<p className="miniatures3d-context" role="status">{props.contextLabel}</p>}
  {focusToken&&<section className="miniatures3d-selected" aria-label="Resumo tático da unidade" role="status">
    <div className="miniatures3d-selected-title">
     <strong>{focusToken.name}</strong>
     <span>{focusToken.metricLabel??'Soldados'}: {focusToken.count.toLocaleString('pt-BR')}</span>
     {focusToken.houseLabel&&<small>{focusToken.houseLabel}</small>}
     {focusToken.id===props.activeId&&<small>Unidade ativa</small>}
    </div>
    {allStats.length>0&&<div className="miniatures3d-tactical-stats">
     {allStats.slice(0,3).map((label,i)=><span key={i}>{label}</span>)}
     {allStats.length>3&&<details className="miniatures3d-extra-stats">
      <summary>Mais informações</summary>
      {allStats.slice(3).map((label,i)=><span key={i}>{label}</span>)}
     </details>}
    </div>}
   </section>}
  {failed?<><p role="status">3D indisponível neste dispositivo. Mapa 2D preservado.</p>{fallback}</>:<>
   <div className="miniatures3d-toolbar miniatures3d-camera-controls" role="group" aria-label="Câmera do mapa 3D">
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
   <div className="miniatures3d-side-legend" aria-label="Legenda visual das peças">
    <span>● Atacante</span><span>■ Defensor</span>
    <span>◆ Movimento</span><span>✕ Ataque</span>
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
   {inspection&&<section className="miniatures3d-terrain-inspector"
    aria-label="Inspeção do terreno" role="status">
    <strong>Quadrado {inspection.coordinates} · {inspection.terrain}</strong>
    {inspection.features.length>0&&<span>{inspection.features.join(' · ')}</span>}
    {inspection.effects?.length?<>
     <strong>Regras do terreno (fonte: motor)</strong>
     <ul>{inspection.effects.map(effect=><li key={effect}>{effect}</li>)}</ul>
    </>:null}
    {inspection.occupant&&<span>Unidade: {inspection.occupant} ({inspection.side})</span>}
    <Button variant="ghost" size="sm" aria-label="Fechar inspeção do terreno"
     onClick={()=>setInspected(null)}>Fechar</Button>
   </section>}
   {message&&<p className="miniatures3d-feedback" role="status">{message}</p>}
   <details className="miniatures3d-keyboard-nav">
    <summary>Selecionar quadrado pelo teclado</summary>
    <label>Quadrado do tabuleiro
     <select aria-label="Quadrado do tabuleiro" value={navigationCell}
      onChange={event=>setKeyboardCell(event.target.value)}>
      {props.map.tiles.map(tile=><option key={tile.q+','+tile.r} value={tile.q+','+tile.r}>
       {tile.q},{tile.r} · {tile.terrain}
      </option>)}
     </select>
    </label>
    <Button variant="outline" size="sm" disabled={!navigationCell}
     onClick={()=>{
      const [q,r]=navigationCell.split(',').map(Number);
      if(Number.isInteger(q)&&Number.isInteger(r))onCellClick({q,r});
     }}>Inspecionar ou selecionar</Button>
    <p>Ações legais exigem confirmação. Para navegação completa por setas, use Mapa 2D.</p>
   </details>
   <p className="miniatures3d-sr-only">
    Arraste para percorrer o tabuleiro 3D ou use o seletor de quadrado acessível.
    Movimentos e ataques legais exigem confirmação.
   </p>
   <div className="miniatures3d-perf-controls">
    <Button variant="outline" size="sm" disabled={measuring||!ready}
     onClick={()=>{setPerformanceSample(null);setMeasuring(true);}}>
     {measuring?'Medindo FPS…':'Medir FPS (5 s)'}
    </Button>
    {performanceSample&&<output role="status" aria-label="Resultado FPS da renderização">
     {performanceSample.fps.toLocaleString('pt-BR')} FPS · {performanceSample.tokenCount} peças ·
     {performanceSample.averageDrawCalls} chamadas/desenho
    </output>}
   </div>
   <div className="miniatures3d-viewport" aria-label="Tabuleiro quadrado com miniaturas 3D">
    {!ready&&<div className="miniatures3d-status" role="status">
     <span>Preparando miniaturas 3D…</span>
     <Button variant="outline" size="sm" onClick={fail}>Usar mapa 2D agora</Button>
    </div>
    {palette&&<ClientOnly fallback={null}><SceneBoundary onFailure={fail} fallback={null}>
     <Suspense fallback={null}><Scene {...props} onHexClick={onCellClick}
      pendingAction={validPending} palette={palette} top={top} zoom={zoom}
      reset={reset} focus={focus} reducedMotion={reduced}
      measurePerformance={measuring} onPerformanceSample={sample=>{
       setPerformanceSample(sample);setMeasuring(false);
      }}
      onReady={()=>setReady(true)} onFailure={fail}/></Suspense>
    </SceneBoundary></ClientOnly>}
   </div>
  </>}
 </div>;
}
