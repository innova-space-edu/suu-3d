"use client";
import {Canvas} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {useState} from "react";
import {type FaceView,type PointCount,type CleanMode} from "@/lib/face-v4-geometry";
import {VISEMES} from "@/lib/lip-sync";
import {FACE_CHANNELS,type FacePose} from "@/lib/face-rig";
import {AnatomicalHead,ViewerBoundary} from "./SuuAnatomicalHead";

const modes:{id:CleanMode;name:string;description:string}[]=[
 {id:"puntos",name:"Solo puntos",description:"Partículas sobre la malla, con iluminación por relieve"},
 {id:"contornos",name:"Puntos + contornos",description:"Superficie azul tenue y partículas siguiendo sus relieves"},
 {id:"superficie",name:"Superficie sólida",description:"Inspeccionar la anatomía sin partículas"}
];
export default function SuuFaceV4Lab(){
 const [pose,setPose]=useState<FacePose>({});
 const [talk,setTalk]=useState(false);
 const [view,setView]=useState<FaceView>("frente");
 const [viewRevision,setViewRevision]=useState(0);
 const [rotated,setRotated]=useState(false);
 const [count,setCount]=useState<PointCount>(100000);
 const [mode,setMode]=useState<CleanMode>("contornos");
 const [size,setSize]=useState(1.0);
 const [brightness,setBrightness]=useState(1.0);
 const [contrast,setContrast]=useState(.72);
 const [attempt,setAttempt]=useState(0);
 const [loaded,setLoaded]=useState(0),[failure,setFailure]=useState("");
 return <main className="faceLab">
  <header className="labHeader">
   <div><a href="/">← Volver a SUU</a><h1>SUU V5 · Rostro de puntos</h1>
    <p>Malla anatómica y 100.000 puntos sobre su superficie. Gira, acerca y compara los perfiles.</p></div>
   <span>LABORATORIO · MISMO ROSTRO QUE SUU</span>
  </header>
  <section className="labViewport" aria-label="Visor 3D experimental">
   <ViewerBoundary key={attempt}><Canvas style={{position:"absolute",inset:0,width:"100%",height:"100%"}} onCreated={({gl})=>{gl.debug.onShaderError=(context,program,vertex,fragment)=>{console.error("[SUU shader]",context.getProgramInfoLog(program),context.getShaderInfoLog(vertex),context.getShaderInfoLog(fragment));setFailure("Error gráfico al dibujar los puntos. Pulsa Reintentar.")}}} fallback={<div className="labLoading labError">Tu navegador no pudo iniciar WebGL.</div>} camera={{position:[0,.02,3.55],fov:43}} dpr={[1,1.6]} gl={{antialias:true}}>
    <color attach="background" args={["#020e20"]}/>
    <ambientLight intensity={.65*brightness}/>
    <directionalLight position={[1,3,4]} intensity={1.8*brightness}/>
    <directionalLight position={[-3,1,3]} intensity={.75*brightness}/>
    <AnatomicalHead demoSpeech={talk} pose={pose} speaking={talk} energy={talk?.35:0} autoBlink={talk} viewRevision={viewRevision} view={view} count={count} mode={mode} size={size} brightness={brightness} contrast={contrast} onProgress={setLoaded} onError={setFailure}/>
    <OrbitControls onStart={()=>setRotated(true)} key={`${view}-${viewRevision}`} target={[0,-.30,0]} enablePan={false} enableDamping minDistance={2.7} maxDistance={6}/>
   </Canvas></ViewerBoundary>
   <span className="labCount">{Math.min(count,loaded).toLocaleString("es-CL")} / {count.toLocaleString("es-CL")} puntos · {rotated?"vista libre":view} · {mode}</span>
   {loaded<count&&!failure&&<div className="labLoading" role="status">{loaded===0?"Cargando malla facial…":`Generando puntos: ${Math.round(100*loaded/100000)}%`}</div>}
   {failure&&<div className="labLoading labError" role="alert">{failure}</div>}
  </section>
  <section className="labControls" aria-label="Controles de visualización">
   <div><strong>Formas de pronunciación</strong><div className="labButtons">{["A","E","I","O","U","MBP"].map(v=><button key={v} onClick={()=>{setTalk(false);setPose(VISEMES[v])}}>{v==="MBP"?"Cerrar M/P/B":v}</button>)}</div></div>
   <div><strong>Expresiones</strong><div className="labButtons">
    <button onClick={()=>{setPose({});setTalk(false)}}>Neutral</button>
    <button onClick={()=>{setTalk(false);setPose({jaw:.65})}}>Abrir boca</button>
    <button onClick={()=>{setTalk(false);setPose({smile:.8})}}>Sonreír</button>
    <button onClick={()=>{setTalk(false);setPose({frown:.8})}}>Gesto serio</button>
    <button onClick={()=>{setTalk(false);setPose({blinkLeft:1,blinkRight:1})}}>Parpadear</button>
    <button aria-pressed={talk} onClick={()=>{setPose({});setTalk(v=>!v)}}>Hablar · demostración</button>
   </div></div>
   {FACE_CHANNELS.map((key,i)=><div className="labTuning" key={key}><label htmlFor={"pose-"+key}>{["Mandíbula","Sonrisa","Serio · boca, ojos y cejas","Labios redondos","Labios anchos","Párpado izquierdo","Párpado derecho","Cejas arriba","Cejas abajo"][i]} <output>{Math.round((pose[key]||0)*100)}%</output></label><input id={"pose-"+key} type="range" min="0" max="1" step=".01" value={pose[key]||0} onChange={e=>{setTalk(false);setPose(p=>({...p,[key]:Number(e.target.value)}))}}/></div>)}
   <div><strong>Visor</strong><div className="labButtons"><button onClick={()=>{setLoaded(0);setFailure("");setAttempt(v=>v+1)}}>Reintentar / restablecer</button></div></div>
   <div><strong>Vista</strong><div className="labButtons">
    {(["frente","izquierda","derecha"] as FaceView[]).map(v=><button key={v} aria-pressed={v===view} onClick={()=>{setRotated(false);setViewRevision(n=>n+1);setView(v)}}>{v==="frente"?"Frontal":v==="izquierda"?"Perfil izquierdo":"Perfil derecho"}</button>)}
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
  <p className="labNote">Luz azul global, superficie de apoyo y puntos sobre sus relieves. Base anatómica con párpados, orejas y cuello conectados; globos oculares con volumen, aún experimental: no es una reconstrucción exacta de las referencias y sus expresiones son deformaciones experimentales. La demostración de habla es simulada; la conversación combina tiempos por palabra cuando la voz los entrega y formas de labios estimadas dentro de cada palabra. No es alineación fonética exacta.</p>
 </main>;
}
