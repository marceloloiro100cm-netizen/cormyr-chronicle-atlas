import {useEffect,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {MOUSE,TOUCH,Vector3,type OrthographicCamera} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {cameraBaseFit} from '@/lib/battle/visual3d/interaction';

export type CameraFocus=Readonly<{x:number;z:number;nonce:number}>;
/** Do NOT reset orbit target while zooming or changing perspective. The
 * previous implementation called target.set(0,0,0) for every zoom change.
 */
export function CameraRig({width,height,top,zoom,reset,focus}:{
 width:number;height:number;top:boolean;zoom:number;reset:number;focus?:CameraFocus|null;
}){
 const {camera,size,invalidate}=useThree();
 const controls=useRef<OrbitControlsImpl>(null);
 const previous=useRef<{
  top:boolean;zoom:number;reset:number;width:number;height:number;
  base:number;focusNonce:number|null;
 }|null>(null);
 useEffect(()=>{
  const ortho=camera as OrthographicCamera;
  const base=cameraBaseFit(width,height,size.width,size.height,top);
  const old=previous.current;
  const mapChanged=Boolean(old&&(old.width!==width||old.height!==height));
  const recenter=!old||mapChanged||old.reset!==reset;
  const target=controls.current?.target.clone()??new Vector3(0,0,0);
  if(recenter)target.set(0,0,0);
  if(focus&&focus.nonce!==old?.focusNonce)target.set(focus.x,0,focus.z);
  const directionScale=Math.max(width,height);
  const direction=top?new Vector3(0,directionScale*2,.001):
   new Vector3(directionScale,directionScale*1.4,directionScale);
  camera.position.copy(target).add(direction);
  camera.lookAt(target);
  // Preserve any wheel/pinch zoom applied by OrbitControls. Only fit scaling
  // and the explicit toolbar zoom factor are relative changes.
  const nextZoom=recenter?base*zoom:
   ortho.zoom*(base/(old?.base??base))*(zoom/(old?.zoom??zoom));
  ortho.zoom=Math.max(5,Math.min(150,nextZoom));
  ortho.updateProjectionMatrix();
  controls.current?.target.copy(target);
  controls.current?.update();
  previous.current={top,zoom,reset,width,height,base,focusNonce:focus?.nonce??null};
  invalidate();
 },[camera,size.width,size.height,width,height,top,zoom,reset,focus?.nonce,focus?.x,focus?.z,invalidate]);
 return <OrbitControls ref={controls} makeDefault enableRotate={false} enableDamping={false}
  screenSpacePanning enablePan enableZoom minZoom={5} maxZoom={150}
  mouseButtons={{LEFT:MOUSE.PAN,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}}
  touches={{ONE:TOUCH.PAN,TWO:TOUCH.DOLLY_PAN}}/>;
}
