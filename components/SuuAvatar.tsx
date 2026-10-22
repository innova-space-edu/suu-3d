"use client";
import {Canvas,useFrame,useThree} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import type {FaceMotion} from "@/hooks/useSuuFaceTracking";
import {AnatomicalHead,ViewerBoundary} from "./SuuAnatomicalHead";
type Props={speaking:boolean;listening:boolean;energy:number;quality:"eco"|"high";solid:boolean;tracking?:FaceMotion;cameraActive?:boolean};
function Scene({speaking,listening,energy,quality,solid,tracking,cameraActive,onProgress,onError}:Props&{onProgress:(n:number)=>void;onError:(s:string)=>void}){
 const head=useRef<THREE.Group>(null);
 const {camera,size}=useThree();
 useEffect(()=>{
  // Fit the same anatomical bust in both the chat column and full-screen voice view.
  const aspect=size.width/Math.max(1,size.height);
  camera.position.set(0,-.15,Math.max(4.8,2.05/(Math.tan(43*Math.PI/360)*aspect)));
  camera.lookAt(0,-.15,0);
 },[camera,size.width,size.height]);
 useFrame(({clock,pointer},dt)=>{
  if(!head.current)return;
  const yaw=cameraActive&&tracking?tracking.yaw*.4:pointer.x*.12+.12;
  const pitch=cameraActive&&tracking?-tracking.pitch*.27:-pointer.y*.05;
  head.current.rotation.y=THREE.MathUtils.damp(head.current.rotation.y,yaw,5,dt);
  head.current.rotation.x=THREE.MathUtils.damp(head.current.rotation.x,pitch,5,dt);
  head.current.rotation.z=THREE.MathUtils.damp(head.current.rotation.z,cameraActive?(tracking?.roll||0)*-.2:0,5,dt);
  head.current.position.y=Math.sin(clock.elapsedTime*.8)*.008+(listening?.008:0);
 });
 const brightness=1+(speaking?Math.min(1,Math.max(0,energy))*.18:listening?.04:0);
 return <>
  <color attach="background" args={["#020e20"]}/>
  <ambientLight intensity={.65*brightness}/>
  <directionalLight position={[1,3,4]} intensity={1.8*brightness}/>
  <directionalLight position={[-3,1,3]} intensity={.75*brightness}/>
  <group ref={head}>
   <AnatomicalHead manageCamera={false} viewRevision={0} view="frente" count={quality==="high"?100000:25000} mode={solid?"superficie":"contornos"} size={1} brightness={brightness} contrast={.72} onProgress={onProgress} onError={onError}/>
  </group>
  <OrbitControls target={[0,-.15,0]} enablePan={false} enableDamping minDistance={3.1} maxDistance={14}/>
 </>;
}
export default function SuuAvatar(props:Props){
 const [loaded,setLoaded]=useState(0),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 const count=props.quality==="high"?100000:25000;
 const retry=()=>{setError("");setLoaded(0);setAttempt(n=>n+1)};
 return <div className="avatarHost" data-avatar-version="5">
  <ViewerBoundary key={attempt}><Canvas style={{position:"absolute",inset:0,width:"100%",height:"100%"}} dpr={[1,props.quality==="eco"?1.2:1.6]} gl={{antialias:props.quality==="high"}} camera={{position:[0,-.15,4.8],fov:43}} fallback={<div className="labLoading labError" role="alert">No se pudo iniciar WebGL.</div>} onCreated={({gl})=>{gl.debug.onShaderError=()=>setError("No se pudo dibujar el rostro.")}}><Scene {...props} onProgress={setLoaded} onError={setError}/></Canvas></ViewerBoundary>
  {loaded<count&&!error&&<div className="labLoading" role="status">{loaded?"Preparando puntos…":"Cargando rostro…"}</div>}
  {error&&<div className="labLoading labError" role="alert">{error}</div>}
  <button className="avatarRetry" onClick={retry} aria-label="Recargar rostro" title="Recargar rostro">↻</button>
  <span className="avatarSignature">SUU V5 · {Math.min(loaded,count).toLocaleString("es-CL")} PUNTOS · {props.speaking?"HABLANDO":props.listening?"ESCUCHANDO":"ACTIVA"}</span>
 </div>;
}
