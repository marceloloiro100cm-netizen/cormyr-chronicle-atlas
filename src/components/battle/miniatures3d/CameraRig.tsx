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
  // Fit BOTH axes, including mobile portrait. No scene-size dependence on labels.
  const span=top?Math.max(width,height):width+height;
  ortho.zoom=Math.min(size.width,size.height)/(span+3)*zoom;
  ortho.updateProjectionMatrix();
  controls.current?.target.set(0,0,0);controls.current?.update();invalidate();
 },[camera,size.width,size.height,width,height,top,zoom,reset,invalidate]);
 return <OrbitControls ref={controls} makeDefault enableRotate={false} enableDamping={false}
  screenSpacePanning enablePan enableZoom minZoom={5} maxZoom={150}
  mouseButtons={{LEFT:MOUSE.PAN,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}}
  touches={{ONE:TOUCH.PAN,TWO:TOUCH.DOLLY_PAN}}/>;
}