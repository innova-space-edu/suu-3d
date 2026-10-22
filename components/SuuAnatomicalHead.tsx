"use client";
import {useThree} from "@react-three/fiber";
import {Component,useEffect,useState,type ReactNode} from "react";
import * as THREE from "three";
import {loadFaceGeometry,type FaceGeometryBundle,type FaceView,type PointCount,type CleanMode} from "@/lib/face-v4-geometry";
import {makeCleanPointMaterial} from "@/lib/face-point-shader";
type Controls={manageCamera?:boolean;viewRevision:number;view:FaceView;count:PointCount;mode:CleanMode;size:number;brightness:number;contrast:number;onProgress:(count:number)=>void;onError:(message:string)=>void};
export class ViewerBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<div className="labLoading labError" role="alert">No se pudo iniciar el visor 3D. Comprueba la aceleración gráfica y pulsa Reintentar.</div>:this.props.children}
}
export function AnatomicalHead({manageCamera=true,viewRevision,view,count,mode,size,brightness,contrast,onProgress,onError}:Controls){
 const [geometry,setGeometry]=useState<FaceGeometryBundle|null>(null);
 const [received,setReceived]=useState(0);
 const {camera,gl}=useThree();
 useEffect(()=>{
  if(!manageCamera)return;
  camera.position.set(view==="frente"?0:view==="izquierda"?-4.8:4.8,-.27,view==="frente"?4.8:0);
  camera.lookAt(0,-.30,0);
 },[camera,view,viewRevision,manageCamera]);
 useEffect(()=>{
  const abort=new AbortController();let bundle:FaceGeometryBundle|undefined,worker:Worker|undefined;
  const timer=setTimeout(()=>{abort.abort();worker?.terminate();onError("La carga tardó demasiado. Pulsa Reintentar.")},30000);
  onProgress(0);
  void (async()=>{
   try{
    if(typeof Worker==="undefined")throw new Error("Este navegador no admite el generador de puntos.");
    bundle=await loadFaceGeometry(abort.signal);
    if(abort.signal.aborted){bundle.dispose();return}
    setGeometry(bundle);
    worker=new Worker("/face-v4-worker.js");
    worker.onmessage=({data:m})=>{
     if(abort.signal.aborted||!bundle)return;
     if(m.type==="error"){clearTimeout(timer);onError(String(m.message));worker?.terminate();return}
     if(m.type==="complete"){clearTimeout(timer);worker?.terminate();return}
     if(m.type!=="chunk")return;
     for(const [name,key,width] of [["position","position",3],["normal","normal",3],["color","color",3],["aImportance","importance",1]] as const){
      const attribute=bundle.cloud.getAttribute(name) as THREE.BufferAttribute;
      (attribute.array as Float32Array).set(new Float32Array(m[key]),m.offset*width);
      attribute.addUpdateRange(m.offset*width,m.count*width);attribute.needsUpdate=true;
     }
     setReceived(m.offset+m.count);onProgress(m.offset+m.count);
    };
    worker.onerror=()=>{clearTimeout(timer);onError("No se pudo generar el rostro. Pulsa Reintentar.");worker?.terminate()};
    const position=new Float32Array(bundle.surface.getAttribute("position").array),normal=new Float32Array(bundle.surface.getAttribute("normal").array),color=new Float32Array(bundle.surface.getAttribute("color").array);
    const index=bundle.surface.index?new Uint32Array(bundle.surface.index.array):Uint32Array.from({length:position.length/3},(_,i)=>i);
    worker.postMessage({type:"generate",count:100000,position:position.buffer,normal:normal.buffer,color:color.buffer,index:index.buffer},[position.buffer,normal.buffer,color.buffer,index.buffer]);
   }catch(error){clearTimeout(timer);if(!abort.signal.aborted)onError(error instanceof Error?error.message:"Error cargando el rostro")}
  })();
  return()=>{abort.abort();clearTimeout(timer);worker?.terminate();bundle?.dispose()};
 },[onProgress,onError]);
 useEffect(()=>{geometry?.cloud.setDrawRange(0,Math.min(count,received))},[geometry,count,received]);
 // Material is mounted declaratively below; update uniforms without rebuilding geometry.
 const [pointMaterial]=useState(()=>makeCleanPointMaterial({size,brightness,opacity:contrast}));
 useEffect(()=>()=>pointMaterial.dispose(),[pointMaterial]);
 useEffect(()=>{
  pointMaterial.uniforms.uPixelSize.value=size;pointMaterial.uniforms.uDpr.value=gl.getPixelRatio();
  pointMaterial.uniforms.uBrightness.value=brightness;pointMaterial.uniforms.uOpacity.value=contrast;
  pointMaterial.uniforms.uContours.value=mode==="puntos"?0:1;
 },[pointMaterial,size,brightness,contrast,mode,gl]);
 if(!geometry)return null;
 return <group dispose={null}>
  {mode==="puntos"&&<mesh geometry={geometry.surface} renderOrder={-10}>
   <meshBasicMaterial colorWrite={false} depthWrite={true} depthTest={true} side={THREE.FrontSide}/>
  </mesh>}
  {mode!=="puntos"&&<mesh geometry={geometry.surface} renderOrder={-4}>
   <meshStandardMaterial key={mode} color={mode==="superficie"?"#8495a5":"#4e7ca2"} vertexColors={mode!=="superficie"} emissive="#001127" emissiveIntensity={brightness*.10} roughness={.65} metalness={.15}/>
  </mesh>}
  {mode!=="superficie"&&<points geometry={geometry.cloud} renderOrder={2} frustumCulled={false}><primitive object={pointMaterial} attach="material"/></points>}
 </group>;
}

