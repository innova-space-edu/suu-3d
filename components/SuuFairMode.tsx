"use client";
import {useEffect,useRef,useState} from "react";
import SuuVoiceMode,{type FairVoiceCommand} from "./SuuVoiceMode";
import {useFairCamera} from "@/hooks/useFairCamera";
import {calibrateFair,FAIR_SCRIPTS,FairFlow,FairRecording,validFairExamples,validCalibration,type FairCalibration,type FairAnnouncement,type MotionSample} from "@/lib/fair-flow";
import type {ChatMessage} from "@/lib/providers";

type Props={ttsLocal?:boolean;sttAvailable?:boolean;onClose:()=>void;onTurn:(user:string,reply:string,provider:string)=>void;initial:ChatMessage[];voiceId:string;language:string;quality:"eco"|"high";solid:boolean;noiseReduction:boolean};
const STORAGE="suu-fair-calibration-v1";
const DRAFT="suu-fair-routes-v1";
export default function SuuFairMode(props:Props){
 const [variant,setVariant]=useState<"welcome"|"guide"|null>(null);
 const chooser=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{if(variant===null)chooser.current?.showModal()},[variant]);
 return <div className="fairModeShell">
  {variant===null?<dialog ref={chooser} className="fairIntro" aria-labelledby="fairModeTitle" onCancel={e=>{e.preventDefault();props.onClose()}}>
   <h2 id="fairModeTitle">Modo feria de ciencias</h2>
   <p>Elige cómo participará SUU en la exposición.</p>
   <div className="fairIntroActions">
    <button autoFocus onClick={()=>setVariant("welcome")}><strong>Bienvenida</strong><span className="fairChoiceDescription">Saluda a los grupos que entran y se despide de quienes salen. Usa cámara y recorridos configurados.</span></button>
    <button onClick={()=>setVariant("guide")}><strong>Normal · preguntas y guía</strong><span className="fairChoiceDescription">Conversa sobre los trabajos de la exposición y responde otras preguntas. Sin cámara ni configuración de recorridos.</span></button>
   </div>
   <button className="fairIntroClose" onClick={props.onClose}>Cancelar</button>
  </dialog>:variant==="welcome"?<SuuFairWelcome {...props} onChangeMode={()=>setVariant(null)}/>:<SuuVoiceMode {...props} domain="general" fairMode modeLabel="EXPO CIENCIAS 2026 · NORMAL" cameraActive={false}/>}
  {variant!==null&&<button className="fairModeSwitch" onClick={()=>setVariant(null)}>Cambiar modo de feria</button>}
 </div>;
}

function SuuFairWelcome({onChangeMode,...props}:Props&{onChangeMode:()=>void}){
 const [calibration,setCalibration]=useState<FairCalibration|null>(null),[active,setActive]=useState(false),[open,setOpen]=useState(true),[recording,setRecording]=useState<"entry"|"exit"|null>(null),[tested,setTested]=useState({entry:false,exit:false}),[activity,setActivity]=useState("Sin movimiento"),[notice,setNotice]=useState("Coloca la cámara en su posición definitiva y prueba ambos recorridos."),[command,setCommand]=useState<FairVoiceCommand|null>(null),[available,setAvailable]=useState(false);
 const [intro,setIntro]=useState(true),[loaded,setLoaded]=useState(false),[reuse,setReuse]=useState(false);
 const introDialog=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{if(intro){introDialog.current?.showModal()}},[intro]);
 const canvas=useRef<HTMLCanvasElement|null>(null),flow=useRef(new FairFlow()),isActive=useRef(false),availableRef=useRef(false),serial=useRef(0),busySince=useRef(0);
 const [captured,setCaptured]=useState(0),[learned,setLearned]=useState({entry:false,exit:false});
 const trial=useRef<FairRecording|null>(null),examples=useRef<{entry:MotionSample[];exit:MotionSample[]}>({entry:[],exit:[]}),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 isActive.current=active;
 const camera=useFairCamera((boxes,now,movement)=>{
  const ctx=canvas.current?.getContext("2d");
  if(ctx&&camera.video.current){ctx.drawImage(camera.video.current,0,0,320,240);ctx.strokeStyle="#7effce";ctx.lineWidth=2;for(const b of boxes)ctx.strokeRect(b.x*320,b.y*240,b.width*320,b.height*240)}
  if(trial.current){trial.current.add(boxes);setCaptured(trial.current.samples.length)}
  setActivity(movement.entering?"Entrada detectada (prioridad)":movement.leaving?"Salida detectada":boxes.length?"Personas visibles, sin recorrido claro":"Sin movimiento");
  if(calibration&&!trial.current&&!isActive.current)setTested(t=>{const entry=t.entry||movement.entering,exit=t.exit||(!movement.entering&&movement.leaving);return entry===t.entry&&exit===t.exit?t:{entry,exit}});
  if(isActive.current)flow.current.observe(now,movement.entering,movement.leaving);
 },calibration);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(DRAFT)||"null");if(validFairExamples(saved)){examples.current=saved;setLearned({entry:saved.entry.length>=6,exit:saved.exit.length>=6})}}catch{}},[]);
 useEffect(()=>{try{const c=JSON.parse(localStorage.getItem(STORAGE)||"null");if(validCalibration(c))setCalibration(c)}catch{}finally{setLoaded(true)}},[]);
 useEffect(()=>()=>{if(timeout.current)clearTimeout(timeout.current)},[]);
 useEffect(()=>{if(camera.status!=="ready")setActive(false);if(camera.status==="error"){setNotice(camera.error);setOpen(true)}},[camera.status,camera.error]);
 const announce=(kind:FairAnnouncement)=>{availableRef.current=false;setAvailable(false);busySince.current=performance.now();setCommand({id:++serial.current,text:FAIR_SCRIPTS[kind]})};
 useEffect(()=>{
  if(!active)return;
  const timer=setInterval(()=>{
   const now=performance.now();
   if(busySince.current&&now-busySince.current>45000){setActive(false);setNotice("La voz no terminó a tiempo. La feria quedó pausada; revisa el audio y vuelve a activarla.");busySince.current=0;return}
   const kind=flow.current.poll(now,availableRef.current);if(kind)announce(kind);
  },300);
  return()=>clearInterval(timer);
 },[active]);
 const pause=()=>{setActive(false);flow.current=new FairFlow();busySince.current=0;setCommand(null)};
 const close=()=>{pause();camera.stop();props.onClose()};
 const finishRecording=(kind:"entry"|"exit")=>{
  if(timeout.current)clearTimeout(timeout.current);timeout.current=null;
  const run=trial.current;trial.current=null;setRecording(null);if(!run)return;
  try{const samples=run.finish();examples.current={...examples.current,[kind]:samples};setLearned(v=>({...v,[kind]:true}));try{localStorage.setItem(DRAFT,JSON.stringify(examples.current))}catch{setNotice("El navegador no permitió guardar los recorridos; se conservarán mientras no cierres esta ventana.")}}
  catch(e){setNotice((e instanceof Error?e.message:"Repite este recorrido.")+" El otro recorrido se conserva.");return}
  if(!examples.current.entry.length||!examples.current.exit.length){setNotice(`${kind==="entry"?"Entrada":"Salida"} captada. Ahora enseña el otro recorrido; este se conserva.`);return}
  try{const c=calibrateFair(examples.current.entry,examples.current.exit);setCalibration(c);try{localStorage.setItem(STORAGE,JSON.stringify(c))}catch{}setNotice("Entrada y salida captadas. Calibración lista: ya puedes activar la feria con audio. La prueba sin voz es opcional.")}
  catch(e){setNotice((e instanceof Error?e.message:"Repite el recorrido.")+" Ambos recorridos están captados. Repite solo el que quieras corregir, sin reiniciar la cámara.")}
 };
 const learn=(kind:"entry"|"exit")=>{
  if(timeout.current)clearTimeout(timeout.current);pause();setReuse(false);setCalibration(null);try{localStorage.removeItem(STORAGE)}catch{}setTested({entry:false,exit:false});setRecording(kind);
  trial.current=new FairRecording();setCaptured(0);setNotice("Tienes hasta 12 segundos. Cruza una sola vez y pulsa Finalizar recorrido antes de volver al punto inicial.");
  timeout.current=setTimeout(()=>finishRecording(kind),12000);
 };
 const chooseSetup=(keep:boolean)=>{setReuse(keep);setIntro(false);setOpen(true);if(keep){setNotice("Usando los recorridos guardados. Activa la cámara y después la feria con audio. Si cambiaste la posición, enseña los recorridos de nuevo.")}else{setCalibration(null);setTested({entry:false,exit:false});examples.current={entry:[],exit:[]};setLearned({entry:false,exit:false});try{localStorage.removeItem(STORAGE);localStorage.removeItem(DRAFT)}catch{}setNotice("Activa la cámara, enseña entrada y salida y activa la feria. Puedes comprobar los recorridos sin voz si lo deseas.")}};
 const activate=()=>{flow.current=new FairFlow();setCommand(null);busySince.current=0;setActive(true);setOpen(false);setNotice("Feria activa. Un saludo completo por vez; las entradas tienen prioridad.")};
 return <div className="fairMode">
  {intro&&<dialog ref={introDialog} className="fairIntro" aria-labelledby="fairIntroTitle" onCancel={e=>{e.preventDefault();close()}}>
   <h2 id="fairIntroTitle">Antes de comenzar la feria</h2>
   <ol><li>Coloca la cámara en el acceso y déjala fija.</li><li>Activa la cámara. Si es un lugar nuevo, enseña una entrada y una salida con hasta 12 segundos cada una.</li><li>Activa la feria con audio cuando la calibración esté lista. La comprobación sin voz es opcional.</li></ol>
   <p>SUU termina un saludo completo antes de repetirlo. Las entradas tienen prioridad sobre las despedidas.</p>
   {loaded?(calibration?<><p><strong>Hay una configuración guardada en este navegador.</strong> Ya configuraste la entrada y la salida. Puedes usar la misma configuración o crear una nueva. Usa la guardada si la cámara sigue en la misma posición y orientación.</p><div className="fairIntroActions"><button autoFocus onClick={()=>chooseSetup(true)}>Usar configuración guardada</button><button onClick={()=>chooseSetup(false)}>Crear nueva configuración</button></div></>:<><button autoFocus onClick={()=>{setIntro(false);setOpen(true);setNotice("Activa la cámara y completa el recorrido pendiente. El otro se conserva.")}}>{learned.entry||learned.exit?"Continuar recorridos guardados":"Comenzar configuración"}</button>{(learned.entry||learned.exit)&&<button onClick={()=>chooseSetup(false)}>Borrar recorridos y comenzar de nuevo</button>}</>):<p>Cargando configuración…</p>}
   <button className="fairIntroClose" onClick={onChangeMode}>Elegir otro modo</button>
   <button className="fairIntroClose" onClick={close}>Salir del modo feria</button>
  </dialog>}
  <SuuVoiceMode {...props} onClose={close} domain="general" fairMode modeLabel="EXPO CIENCIAS 2026 · BIENVENIDA" enabled={active} cameraActive={camera.status==="ready"} announcement={command} onAvailable={value=>{availableRef.current=value;setAvailable(value)}} onAnnouncementEnd={success=>{busySince.current=0;flow.current.complete(performance.now());if(!success){setActive(false);setNotice("No se completó el audio. La feria quedó pausada; revisa la voz antes de reanudar.");setOpen(true)}}}/>
  <aside className={"fairPanel "+(!open?"compact":"")} aria-label="Configuración de feria">
   <div className="fairTitle"><b>Expo Ciencias 2026</b><button onClick={()=>setOpen(v=>!v)}>{open?"Ocultar ajustes":"Configurar"}</button></div>
   <p role="status">{notice}</p>
   {active&&<><small>{activity}</small><button onClick={()=>{pause();camera.stop();setOpen(true);setNotice("Feria detenida. Cámara y micrófono apagados.")}}>Detener feria y dispositivos</button></>}
   {open&&<>
    <p>Si ya configuraste entrada y salida, puedes usar la configuración guardada al abrir este modo o crear una nueva. Se guarda en este navegador. Preparación: enseña una entrada y una salida con la cámara fija. La prueba sin voz es opcional. Si mueves la cámara, vuelve a calibrar.</p>
    <canvas ref={canvas} width={320} height={240} aria-label="Vista de cámara para configurar recorridos"/>
    <p>{camera.status==="ready"?activity:camera.status==="loading"?"Cargando detector de personas…":"Cámara apagada"}</p>
    {camera.error&&<p role="alert">{camera.error}</p>}
    <div className="fairButtons"><button disabled={camera.status==="loading"||active||Boolean(recording)||camera.status==="ready"} onClick={()=>{setTested({entry:false,exit:false});void camera.start()}}>1. Activar cámara de prueba</button>
    <button disabled={camera.status!=="ready"||Boolean(recording)||active} onClick={()=>learn("entry")}>{recording==="entry"?"Aprendiendo entrada…":"2. Enseñar entrada (hasta 12 s)"}</button>
    <button disabled={camera.status!=="ready"||Boolean(recording)||active} onClick={()=>learn("exit")}>{recording==="exit"?"Aprendiendo salida…":"3. Enseñar salida (hasta 12 s)"}</button></div>
    {recording&&<button onClick={()=>finishRecording(recording)}>Finalizar recorrido de {recording==="entry"?"entrada":"salida"}</button>}
    <p>Recorridos captados: entrada {learned.entry?"✓":"pendiente"} · salida {learned.exit?"✓":"pendiente"}.</p>
    <p>{reuse&&calibration?"Configuración guardada seleccionada. Puedes activarla sin enseñar de nuevo; usa los botones de entrada y salida si cambiaste el lugar.":<> {recording?`Grabando ${recording==="entry"?"entrada":"salida"}: ${captured} muestras captadas.`:calibration?"Calibración lista. Puedes activar la feria con audio.":`Recorridos: entrada ${learned.entry?"guardada":"pendiente"} · salida ${learned.exit?"guardada":"pendiente"}.`} Comprobación opcional sin voz (no bloquea la activación): entrada {tested.entry?"✓":"pendiente"} · salida {tested.exit?"✓":"pendiente"}.</>}</p>
    <button disabled={active||camera.status!=="ready"||!calibration||Boolean(recording)} onClick={activate}>4. Activar feria con audio</button>
    <div className="fairButtons"><button disabled={!active||!available} onClick={()=>announce("welcome")}>Dar bienvenida</button><button disabled={!active||!available||activity.startsWith("Entrada")} onClick={()=>announce("goodbye")}>Despedir</button></div>
    <small>El análisis de personas ocurre en este equipo. Solo se guardan coordenadas de los recorridos y la calibración, sin imágenes ni identidad. La dirección se estima por el recorrido; una espalda por sí sola no confirma una salida. No es un contador de asistencia.</small>
   </>}
  </aside>
 </div>;
}
