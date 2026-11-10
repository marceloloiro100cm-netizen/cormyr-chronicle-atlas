import {useEffect,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {MOUSE,TOUCH,type OrthographicCamera} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';

export function CameraRig({width,height,top,zoom,reset}:{width:number;height:number;top:boolean;zoom:number;reset:number}){
 const {camera,size,invalidate}=useThree();
 const controls=useRef<OrbitControlsImpl>(null);
 useEffect(()=>{
  const ortho=camera as OrthographicCamera;
  const extent=Math.max(width,height);
  camera.position.set(top?0:extent,top?extent*2:extent*1.4,top? .001:extent);
  camera.lookAt(0,0,0);
  // Square maps are projected diagonally by the 45-degree isometric camera.
  // Fit each visible axis separately; the previous min(width,height)/(width+height)
  // formula left the board tiny in wide desktop viewports.
  // These are renderer world units, NOT D&D/GOT movement metres.
  const projectedWidth=top?width:(width+height)/Math.SQRT2;
  const projectedHeight=top?height:(width+height)*.72/Math.SQRT2;
  const fitWidth=size.width/(projectedWidth*1.14+1);
  const fitHeight=size.height/(projectedHeight*1.14+1);
  ortho.zoom=Math.max(5,Math.min(150,Math.min(fitWidth,fitHeight)*zoom));
  ortho.updateProjectionMatrix();
  controls.current?.target.set(0,0,0);controls.current?.update();invalidate();
 },[camera,size.width,size.height,width,height,top,zoom,reset,invalidate]);
 return <OrbitControls ref={controls} makeDefault enableRotate={false} enableDamping={false}
  screenSpacePanning enablePan enableZoom minZoom={5} maxZoom={150}
  mouseButtons={{LEFT:MOUSE.PAN,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}}
  touches={{ONE:TOUCH.PAN,TWO:TOUCH.DOLLY_PAN}}/>;
}