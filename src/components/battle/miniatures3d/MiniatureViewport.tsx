import {Component,lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react';
import {ClientOnly} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
import {Minus,Plus,RotateCcw} from 'lucide-react';
import type {SceneProps} from './MiniatureScene';
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
type Props=Omit<SceneProps,'palette'|'top'|'zoom'|'reset'|'reducedMotion'|'onReady'|'onFailure'>&{fallback:ReactNode;onFailure?:()=>void};
export function MiniatureViewport({fallback,onFailure,...props}:Props){
 const wrapper=useRef<HTMLDivElement>(null);
 const [palette,setPalette]=useState<MiniaturePalette|null>(null);
 const [failed,setFailed]=useState(false);const [ready,setReady]=useState(false);
 const [top,setTop]=useState(false);const [zoom,setZoom]=useState(1);const [reduced,setReduced]=useState(true);
 const [reset,setReset]=useState(0);
 const focusToken=props.tokens.find(t=>t.id===(props.selectedId??props.activeId));
 const fail=()=>{setFailed(true);onFailure?.();};
 useEffect(()=>{
  if(!webGLAvailable()){fail();return;}
  if(wrapper.current)setPalette(readMiniaturePalette(wrapper.current));
  const query=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const update=()=>setReduced(Boolean(query?.matches));update();query?.addEventListener?.('change',update);
  return ()=>query?.removeEventListener?.('change',update);
 },[]);
 useEffect(()=>{
  if(!palette||ready||failed)return;
  const timer=setTimeout(fail,20000);return ()=>clearTimeout(timer);
 },[palette,ready,failed]);
 return <div ref={wrapper} className="miniatures3d" data-scene-ready={ready&&!failed?'1':undefined}
  data-token-count={props.tokens.length}>
   {focusToken&&<p className="miniatures3d-selected" role="status">
    <strong>{focusToken.name}</strong> · {focusToken.metricLabel??'Soldados'}:
    {' '}{focusToken.count.toLocaleString('pt-BR')}
    {focusToken.houseLabel?' · '+focusToken.houseLabel:''}
   </p>}
  {failed?<><p role="status">3D indisponível neste dispositivo. Mapa 2D preservado.</p>{fallback}</>:<>
   <div className="miniatures3d-toolbar" role="group" aria-label="Câmera do mapa 3D">
    <Button variant="outline" aria-pressed={!top} onClick={()=>setTop(false)}>Isométrica</Button>
    <Button variant="outline" aria-pressed={top} onClick={()=>setTop(true)}>Superior</Button>
    <Button variant="outline" size="icon" title="Reduzir zoom" aria-label="Reduzir zoom 3D" disabled={zoom<=.6} onClick={()=>setZoom(v=>Math.max(.6,v-.2))}><Minus/></Button>
    <Button variant="outline" size="icon" title="Ampliar zoom" aria-label="Ampliar zoom 3D" disabled={zoom>=2.4} onClick={()=>setZoom(v=>Math.min(2.4,v+.2))}><Plus/></Button>
    <Button variant="outline" size="icon" title="Centralizar câmera" aria-label="Centralizar câmera 3D" onClick={()=>{setZoom(1);setTop(false);setReset(v=>v+1);}}><RotateCcw/></Button>
   </div>
   <p className="miniatures3d-sr-only">Para navegação pelo teclado e leitores de tela, use Mapa 2D. No 3D, arraste para percorrer o tabuleiro.</p>
   <div className="miniatures3d-viewport" aria-label="Tabuleiro quadrado com miniaturas 3D">
    {!ready&&<p role="status" className="miniatures3d-status">Preparando miniaturas…</p>}
    {palette&&<ClientOnly fallback={null}><SceneBoundary onFailure={fail} fallback={null}>
     <Suspense fallback={null}><Scene {...props} palette={palette} top={top} zoom={zoom} reset={reset} reducedMotion={reduced} onReady={()=>setReady(true)} onFailure={fail}/></Suspense>
    </SceneBoundary></ClientOnly>}
   </div>
  </>}
 </div>;
}