"use client";
import {useFrame,useThree} from "@react-three/fiber";
import {Component,useEffect,useRef,useState,type ReactNode} from "react";
import * as THREE from "three";
import {loadFaceGeometry,type FaceGeometryBundle,type FaceView,type PointCount,type CleanMode} from "@/lib/face-v4-geometry";
import {makeCleanPointMaterial} from "@/lib/face-point-shader";
import {poseWeights,type FacePose} from "@/lib/face-rig";
import type {FaceMotion} from "@/hooks/useSuuFaceTracking";
type Controls={demoSpeech?:boolean;pose?:FacePose;speaking?:boolean;listening?:boolean;energy?:number;tracking?:FaceMotion;autoBlink?:boolean;manageCamera?:boolean;viewRevision:number;view:FaceView;count:PointCount;mode:CleanMode;size:number;brightness:number;contrast:number;onProgress:(count:number)=>void;onError:(message:string)=>void};
export class ViewerBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<div className="labLoading labError" role="alert">No se pudo iniciar el visor 3D. Comprueba la aceleración gráfica y pulsa Reintentar.</div>:this.props.children}
}
export function AnatomicalHead({demoSpeech=false,pose={},speaking=false,listening=false,energy=0,tracking,autoBlink=true,manageCamera=true,viewRevision,view,count,mode,size,brightness,contrast,onProgress,onError}:Controls){
 const [geometry,setGeometry]=useState<FaceGeometryBundle|null>(null);
 const [received,setReceived]=useState(0);
 const root=useRef<THREE.Group>(null);
 const weights=useRef(new Array(9).fill(0));
 useFrame(({clock},dt)=>{
  const t=clock.elapsedTime,phase=t%4.7;
  const blink=autoBlink&&phase>4.45?Math.sin((phase-4.45)/.25*Math.PI):0;
  const target=poseWeights({...pose,
   jaw:pose.jaw??(speaking?Math.min(.8,Math.max(0,demoSpeech?.08+.30*Math.abs(Math.sin(t*7))*Math.abs(Math.sin(t*1.9)):energy)*1.8):tracking?.mouth||0),
   smile:pose.smile??tracking?.smile??(listening?.08:0),
   blinkLeft:pose.blinkLeft??Math.max(blink,tracking?.blink||0),
   blinkRight:pose.blinkRight??Math.max(blink,tracking?.blink||0),
   browUp:pose.browUp??(listening?.12:0)});
  const alpha=1-Math.exp(-Math.min(dt,.1)*20);
  for(let i=0;i<target.length;i++)weights.current[i]+=(target[i]-weights.current[i])*alpha;
  root.current?.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){if(o.morphTargetInfluences)for(let i=0;i<target.length;i++)o.morphTargetInfluences[i]=weights.current[i]}});
 });
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
     for(let t=0;t<(m.morphs?.length||0);t++)for(const [key,name] of [["morphs","position"],["morphNormals","normal"]] as const){
      const attr=bundle.cloud.morphAttributes[name]![t];(attr.array as Float32Array).set(new Float32Array(m[key][t]),m.offset*3);
     }
     setReceived(m.offset+m.count);onProgress(m.offset+m.count);
    };
    worker.onerror=()=>{clearTimeout(timer);onError("No se pudo generar el rostro. Pulsa Reintentar.");worker?.terminate()};
    const position=new Float32Array(bundle.surface.getAttribute("position").array),normal=new Float32Array(bundle.surface.getAttribute("normal").array),color=new Float32Array(bundle.surface.getAttribute("color").array);
    const index=bundle.surface.index?new Uint32Array(bundle.surface.index.array):Uint32Array.from({length:position.length/3},(_,i)=>i);
    const morphs=bundle.surface.morphAttributes.position!.map(a=>new Float32Array(a.array).buffer),morphNormals=bundle.surface.morphAttributes.normal!.map(a=>new Float32Array(a.array).buffer);
    worker.postMessage({type:"generate",count:100000,morphs,morphNormals,position:position.buffer,normal:normal.buffer,color:color.buffer,index:index.buffer},[position.buffer,normal.buffer,color.buffer,index.buffer,...morphs,...morphNormals]);
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
 return <group ref={root} dispose={null}>
  {mode==="puntos"&&<mesh args={[geometry.surface]} renderOrder={-10}>
   <meshBasicMaterial colorWrite={false} depthWrite={true} depthTest={true} side={THREE.FrontSide}/>
  </mesh>}
  {mode!=="puntos"&&<mesh args={[geometry.surface]} renderOrder={-4}>
   <meshStandardMaterial key={mode} color={mode==="superficie"?"#8495a5":"#4e7ca2"} vertexColors={mode!=="superficie"} emissive="#001127" emissiveIntensity={brightness*.10} roughness={.65} metalness={.15}/>
  </mesh>}
  {mode!=="superficie"&&received===100000&&<points args={[geometry.cloud]} renderOrder={2} frustumCulled={false}><primitive object={pointMaterial} attach="material"/></points>}
 </group>;
}

