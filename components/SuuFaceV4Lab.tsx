"use client";
import {Canvas,useThree} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {Component,useEffect,useState,type ReactNode} from "react";
import * as THREE from "three";
import {loadFaceGeometry,type FaceGeometryBundle,type FaceView,type PointCount,type CleanMode} from "@/lib/face-v4-geometry";
import {makeCleanPointMaterial} from "@/lib/face-point-shader";

type Controls={view:FaceView;count:PointCount;mode:CleanMode;size:number;brightness:number;contrast:number;onProgress:(count:number)=>void;onError:(message:string)=>void};
const modes:{id:CleanMode;name:string;description:string}[]=[
 {id:"puntos",name:"Solo puntos",description:"Partículas sobre la malla, con iluminación por relieve"},
 {id:"contornos",name:"Puntos + contornos",description:"Superficie azul tenue y partículas siguiendo sus relieves"},
 {id:"superficie",name:"Superficie sólida",description:"Inspeccionar la anatomía y los puntos sobre la misma malla"}
];
class ViewerBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<div className="labLoading labError" role="alert">No se pudo iniciar el visor 3D. Comprueba la aceleración gráfica y pulsa Reintentar.</div>:this.props.children}
}
function Head({view,count,mode,size,brightness,contrast,onProgress,onError}:Controls){
 const [geometry,setGeometry]=useState<FaceGeometryBundle|null>(null);
 const [received,setReceived]=useState(0);
 const {camera,gl}=useThree();
 useEffect(()=>{
  camera.position.set(view==="frente"?0:view==="izquierda"?-4.8:4.8,-.27,view==="frente"?4.8:0);
  camera.lookAt(0,-.30,0);
 },[camera,view]);
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
   <meshStandardMaterial color={mode==="superficie"?"#41768b":"#428ad0"} vertexColors={mode!=="superficie"} emissive="#001127" emissiveIntensity={brightness*.3} roughness={.65} metalness={.15}/>
  </mesh>}
  <points geometry={geometry.cloud} renderOrder={2} frustumCulled={false}><primitive object={pointMaterial} attach="material"/></points>
 </group>;
}

export default function SuuFaceV4Lab(){
 const [view,setView]=useState<FaceView>("frente");
 const [count,setCount]=useState<PointCount>(100000);
 const [mode,setMode]=useState<CleanMode>("contornos");
 const [size,setSize]=useState(1.8);
 const [brightness,setBrightness]=useState(1.05);
 const [contrast,setContrast]=useState(.87);
 const [attempt,setAttempt]=useState(0);
 const [loaded,setLoaded]=useState(0),[failure,setFailure]=useState("");
 return <main className="faceLab">
  <header className="labHeader">
   <div><a href="/">← Volver a SUU</a><h1>SUU V4.3 · Rostro de puntos</h1>
    <p>Una misma malla 3D para el rostro y sus 100.000 puntos. Gira, acerca y compara los perfiles.</p></div>
   <span>LABORATORIO · ROSTRO PRINCIPAL SIN CAMBIOS</span>
  </header>
  <section className="labViewport" aria-label="Visor 3D experimental">
   <ViewerBoundary key={attempt}><Canvas style={{position:"absolute",inset:0,width:"100%",height:"100%"}} onCreated={({gl})=>{gl.debug.onShaderError=()=>setFailure("Error gráfico al dibujar los puntos. Pulsa Reintentar.")}} fallback={<div className="labLoading labError">Tu navegador no pudo iniciar WebGL.</div>} camera={{position:[0,.02,3.55],fov:43}} dpr={[1,1.6]} gl={{antialias:true}}>
    <color attach="background" args={["#020e20"]}/>
    <ambientLight intensity={1.3*brightness}/>
    <directionalLight position={[1,3,4]} intensity={2.5*brightness}/>
    <Head view={view} count={count} mode={mode} size={size} brightness={brightness} contrast={contrast} onProgress={setLoaded} onError={setFailure}/>
    <OrbitControls key={view} target={[0,-.30,0]} enablePan={false} enableDamping minDistance={2.7} maxDistance={6}/>
   </Canvas></ViewerBoundary>
   <span className="labCount">{Math.min(count,loaded).toLocaleString("es-CL")} / {count.toLocaleString("es-CL")} puntos · {view} · {mode}</span>
   {loaded<count&&!failure&&<div className="labLoading" role="status">{loaded===0?"Cargando malla facial…":`Generando puntos: ${Math.round(100*loaded/100000)}%`}</div>}
   {failure&&<div className="labLoading labError" role="alert">{failure}</div>}
  </section>
  <section className="labControls" aria-label="Controles de visualización">
   <div><strong>Visor</strong><div className="labButtons"><button onClick={()=>{setLoaded(0);setFailure("");setAttempt(v=>v+1)}}>Reintentar / restablecer</button></div></div>
   <div><strong>Vista</strong><div className="labButtons">
    {(["frente","izquierda","derecha"] as FaceView[]).map(v=><button key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v==="frente"?"Frontal":v==="izquierda"?"Perfil izquierdo":"Perfil derecho"}</button>)}
   </div></div>
   <div><strong>Partículas</strong><div className="labButtons">
    {([25000,50000,100000] as PointCount[]).map(v=><button key={v} aria-pressed={v===count} onClick={()=>setCount(v)}>{v.toLocaleString("es-CL")}</button>)}
   </div></div>
   <div><strong>Capas</strong><div className="labButtons">
    {modes.map(m=><button key={m.id} title={m.description} aria-pressed={m.id===mode} onClick={()=>setMode(m.id)}>{m.name}</button>)}
   </div></div>
   <div className="labTuning">
    <label htmlFor="suu-dot-size">Tamaño de punto <output>{size.toFixed(1)} px</output></label>
    <input id="suu-dot-size" type="range" min=".7" max="2.6" step=".1" value={size} onChange={e=>setSize(Number(e.target.value))}/>
   </div>
   <div className="labTuning">
    <label htmlFor="suu-dot-brightness">Brillo de todo el rostro <output>{Math.round(brightness*100)}%</output></label>
    <input id="suu-dot-brightness" type="range" min=".25" max="1.2" step=".05" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/>
   </div>
   <div className="labTuning">
    <label htmlFor="suu-dot-opacity">Opacidad <output>{Math.round(contrast*100)}%</output></label>
    <input id="suu-dot-opacity" type="range" min=".2" max="1" step=".05" value={contrast} onChange={e=>setContrast(Number(e.target.value))}/>
   </div>
  </section>
  <p className="labNote">Luz azul global, superficie de apoyo y puntos sobre sus relieves. Base V4 con párpados, iris, nariz y labios remodelados a partir de la vista frontal, aún experimental: no es una reconstrucción exacta de las referencias ni incorpora expresiones faciales.</p>
 </main>;
}
