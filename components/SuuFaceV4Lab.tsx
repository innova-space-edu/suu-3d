"use client";
import {Canvas,useFrame} from "@react-three/fiber";
import {OrbitControls,Stars} from "@react-three/drei";
import {useEffect,useMemo,useRef,useState} from "react";
import * as THREE from "three";
import {createFaceGeometry,type FaceView,type PointCount,type CleanMode} from "@/lib/face-v4-geometry";
import {makeCleanPointMaterial} from "@/lib/face-point-shader";

type Controls={view:FaceView;count:PointCount;mode:CleanMode;size:number;brightness:number;contrast:number;onProgress:(count:number)=>void;onError:(message:string)=>void};
const modes:{id:CleanMode;name:string;description:string}[]=[
 {id:"puntos",name:"Solo puntos",description:"Partículas visibles sin superficie ni contornos adicionales"},
 {id:"contornos",name:"Puntos + contornos",description:"Realce de ojos, nariz, labios, mandíbula y orejas"},
 {id:"superficie",name:"Superficie tenue",description:"Puntos, contornos y una capa facial muy transparente"}
];
function Head({view,count,mode,size,brightness,contrast,onProgress,onError}:Controls){
 const group=useRef<THREE.Group>(null);
 const geometry=useMemo(createFaceGeometry,[]);
 const pointMaterial=useMemo(()=>makeCleanPointMaterial({size,brightness,opacity:contrast}),[]);
 const contourMaterial=useMemo(()=>makeCleanPointMaterial({size:size*.88,brightness:brightness*.83,opacity:contrast*.75}),[]);
 useEffect(()=>()=>{geometry.dispose();pointMaterial.dispose();contourMaterial.dispose()},[geometry,pointMaterial,contourMaterial]);

 const [received,setReceived]=useState(0);
 useEffect(()=>{
  if(typeof Worker==="undefined"){onError("Este navegador no admite procesamiento en segundo plano.");return}
  const worker=new Worker("/face-v4-worker.js");let stopped=false;
  worker.onmessage=(event:MessageEvent)=>{
   if(stopped)return;
   const m=event.data;
   if(m.type==="error"){onError(String(m.message||"Error calculando puntos"));return}
   if(m.type!=="chunk")return;
   const start=Number(m.offset);
   const positions=geometry.cloud.getAttribute("position") as THREE.BufferAttribute;
   const colors=geometry.cloud.getAttribute("color") as THREE.BufferAttribute;
   const weight=geometry.cloud.getAttribute("aImportance") as THREE.BufferAttribute;
   (positions.array as Float32Array).set(new Float32Array(m.position),start*3);
   (colors.array as Float32Array).set(new Float32Array(m.color),start*3);
   (weight.array as Float32Array).set(new Float32Array(m.importance),start);
   positions.needsUpdate=true;colors.needsUpdate=true;weight.needsUpdate=true;
   setReceived(start+Number(m.count));onProgress(start+Number(m.count));
  };
  worker.onerror=()=>{if(!stopped)onError("No se pudo ejecutar el generador. Recarga el laboratorio.")};
  worker.postMessage({type:"generate",count:100000});
  return ()=>{stopped=true;worker.terminate()};
 },[geometry,onProgress,onError]);
 useEffect(()=>{geometry.cloud.setDrawRange(0,Math.min(count,received))},[geometry,count,received]);
 useEffect(()=>{
  pointMaterial.uniforms.uPixelSize.value=size;
  pointMaterial.uniforms.uBrightness.value=brightness;
  pointMaterial.uniforms.uOpacity.value=contrast;
  contourMaterial.uniforms.uPixelSize.value=size*.87;
  contourMaterial.uniforms.uBrightness.value=brightness*.78;
  contourMaterial.uniforms.uOpacity.value=contrast*.77;
 },[pointMaterial,contourMaterial,size,brightness,contrast]);
 useFrame((_,dt)=>{
  if(!group.current)return;
  const target=view==="frente"?0:view==="izquierda"?-Math.PI/2:Math.PI/2;
  group.current.rotation.y=THREE.MathUtils.damp(group.current.rotation.y,target,4.8,dt);
 });
 return <group ref={group}>
  {/* Depth only: occludes backside points so dots do not build a bright, flat sphere. */}
  <mesh geometry={geometry.surface} renderOrder={-10}>
    <meshBasicMaterial colorWrite={false} depthWrite={true} depthTest={true} side={THREE.FrontSide}/>
  </mesh>
  {mode==="superficie"&&<mesh geometry={geometry.surface} renderOrder={-4}>
    <meshBasicMaterial vertexColors transparent opacity={.10} depthWrite={false} blending={THREE.NormalBlending}/>
  </mesh>}
  <points geometry={geometry.cloud} renderOrder={2}><primitive object={pointMaterial} attach="material"/></points>
  {mode!=="puntos"&&<points geometry={geometry.contours} renderOrder={3}><primitive object={contourMaterial} attach="material"/></points>}
 </group>;
}

export default function SuuFaceV4Lab(){
 const [view,setView]=useState<FaceView>("frente");
 const [count,setCount]=useState<PointCount>(100000);
 const [mode,setMode]=useState<CleanMode>("contornos");
 const [size,setSize]=useState(1.3);
 const [brightness,setBrightness]=useState(.74);
 const [contrast,setContrast]=useState(.87);
 const [loaded,setLoaded]=useState(0),[failure,setFailure]=useState("");
 return <main className="faceLab">
  <header className="labHeader">
   <div><a href="/">← Volver a SUU</a><h1>SUU V4.1 · Point Cloud Clean</h1>
    <p>100.000 puntos anatómicos, contornos independientes, poca luminosidad y renderizado circular.</p></div>
   <span>LABORATORIO · ROSTRO PRINCIPAL SIN CAMBIOS</span>
  </header>
  <section className="labViewport" aria-label="Visor 3D experimental">
   <Canvas camera={{position:[0,.02,3.55],fov:43}} dpr={[1,1.6]} gl={{antialias:true}}>
    <color attach="background" args={["#020e20"]}/>
    <ambientLight intensity={.48}/>
    <directionalLight position={[1,3,4]} intensity={.65}/>
    <Head view={view} count={count} mode={mode} size={size} brightness={brightness} contrast={contrast} onProgress={setLoaded} onError={setFailure}/>
    <Stars count={90} depth={18} factor={.85} fade/>
    <OrbitControls enablePan={false} enableDamping minDistance={2.7} maxDistance={6}/>
   </Canvas>
   <span className="labCount">{Math.min(count,loaded).toLocaleString("es-CL")} / {count.toLocaleString("es-CL")} puntos · {view} · {mode}</span>
   {loaded<count&&!failure&&<div className="labLoading" role="status">Cargando puntos: {Math.round(100*loaded/100000)}% · la vista permanece interactiva.</div>}
   {failure&&<div className="labLoading labError" role="alert">{failure}</div>}
  </section>
  <section className="labControls" aria-label="Controles de visualización">
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
    <label htmlFor="suu-dot-brightness">Intensidad <output>{Math.round(brightness*100)}%</output></label>
    <input id="suu-dot-brightness" type="range" min=".25" max="1.2" step=".05" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/>
   </div>
   <div className="labTuning">
    <label htmlFor="suu-dot-opacity">Opacidad <output>{Math.round(contrast*100)}%</output></label>
    <input id="suu-dot-opacity" type="range" min=".2" max="1" step=".05" value={contrast} onChange={e=>setContrast(Number(e.target.value))}/>
   </div>
  </section>
  <p className="labNote">Sin efecto bloom, sin combinación aditiva y sin piezas geométricas brillantes. La superficie solo aporta profundidad; los rasgos se trazan con partículas. Modelo aún experimental: requiere un rostro anatómico profesional para reproducir con fidelidad las imágenes de referencia.</p>
 </main>;
}
