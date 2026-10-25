"use client";
import {useEffect,useRef,useState} from "react";
import SuuVoiceMode,{type FairVoiceCommand} from "./SuuVoiceMode";
import {useFairCamera} from "@/hooks/useFairCamera";
import {calibrateFair,FAIR_SCRIPTS,FairFlow,sampleBox,validCalibration,type FairCalibration,type FairAnnouncement,type MotionSample} from "@/lib/fair-flow";
import type {ChatMessage} from "@/lib/providers";

type Props={onClose:()=>void;onTurn:(user:string,reply:string,provider:string)=>void;initial:ChatMessage[];voiceId:string;language:string;quality:"eco"|"high";solid:boolean;noiseReduction:boolean};
const STORAGE="suu-fair-calibration-v1";
export default function SuuFairMode(props:Props){
 const [calibration,setCalibration]=useState<FairCalibration|null>(null),[active,setActive]=useState(false),[open,setOpen]=useState(true),[recording,setRecording]=useState<"entry"|"exit"|null>(null),[tested,setTested]=useState({entry:false,exit:false}),[activity,setActivity]=useState("Sin movimiento"),[notice,setNotice]=useState("Coloca la cámara en su posición definitiva y prueba ambos recorridos."),[command,setCommand]=useState<FairVoiceCommand|null>(null),[available,setAvailable]=useState(false);
 const canvas=useRef<HTMLCanvasElement|null>(null),flow=useRef(new FairFlow()),isActive=useRef(false),availableRef=useRef(false),serial=useRef(0),busySince=useRef(0);
 const trial=useRef<{kind:"entry"|"exit";samples:MotionSample[];frames:number;ambiguous:number}|null>(null),examples=useRef<{entry:MotionSample[];exit:MotionSample[]}>({entry:[],exit:[]}),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 isActive.current=active;
 const camera=useFairCamera((boxes,now,movement)=>{
  const ctx=canvas.current?.getContext("2d");
  if(ctx&&camera.video.current){ctx.drawImage(camera.video.current,0,0,320,240);ctx.strokeStyle="#7effce";ctx.lineWidth=2;for(const b of boxes)ctx.strokeRect(b.x*320,b.y*240,b.width*320,b.height*240)}
  if(trial.current){trial.current.frames++;if(boxes.length===1)trial.current.samples.push(sampleBox(boxes[0]));else trial.current.ambiguous++}
  setActivity(movement.entering?"Entrada detectada (prioridad)":movement.leaving?"Salida detectada":boxes.length?"Personas visibles, sin recorrido claro":"Sin movimiento");
  if(calibration&&!trial.current&&!isActive.current)setTested(t=>{const entry=t.entry||movement.entering,exit=t.exit||(!movement.entering&&movement.leaving);return entry===t.entry&&exit===t.exit?t:{entry,exit}});
  if(isActive.current)flow.current.observe(now,movement.entering,movement.leaving);
 },calibration);
 useEffect(()=>{try{const c=JSON.parse(localStorage.getItem(STORAGE)||"null");if(validCalibration(c))setCalibration(c)}catch{}},[]);
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
 const learn=(kind:"entry"|"exit")=>{
  if(timeout.current)clearTimeout(timeout.current);pause();setCalibration(null);try{localStorage.removeItem(STORAGE)}catch{}setTested({entry:false,exit:false});setRecording(kind);
  trial.current={kind,samples:[],frames:0,ambiguous:0};setNotice("Camina por el paso durante 6 segundos. Solo una persona debe aparecer en esta prueba.");
  timeout.current=setTimeout(()=>{
   const run=trial.current;trial.current=null;setRecording(null);if(!run)return;
   if(run.samples.length<10||run.ambiguous>run.frames*.3){setNotice("No se pudo seguir una sola persona durante la prueba. Repite este recorrido.");return}
   examples.current[kind]=run.samples;
   if(!examples.current.entry.length||!examples.current.exit.length){setNotice("Recorrido guardado temporalmente. Ahora enseña el otro recorrido.");return}
   try{const c=calibrateFair(examples.current.entry,examples.current.exit);setCalibration(c);try{localStorage.setItem(STORAGE,JSON.stringify(c))}catch{}setNotice("Calibración lista. Haz una entrada y una salida de prueba sin voz para habilitar el modo automático.")}catch(e){setNotice(e instanceof Error?e.message:"Repite las pruebas.")}
  },6000);
 };
 const activate=()=>{flow.current=new FairFlow();setCommand(null);busySince.current=0;setActive(true);setOpen(false);setNotice("Feria activa. Un saludo completo por vez; las entradas tienen prioridad.")};
 return <div className="fairMode">
  <SuuVoiceMode {...props} onClose={close} domain="general" fairMode enabled={active} cameraActive={camera.status==="ready"} announcement={command} onAvailable={value=>{availableRef.current=value;setAvailable(value)}} onAnnouncementEnd={success=>{busySince.current=0;flow.current.complete(performance.now());if(!success){setActive(false);setNotice("No se completó el audio. La feria quedó pausada; revisa la voz antes de reanudar.");setOpen(true)}}}/>
  <aside className={"fairPanel "+(!open?"compact":"")} aria-label="Configuración de feria">
   <div className="fairTitle"><b>Expo Ciencias 2026</b><button onClick={()=>setOpen(v=>!v)}>{open?"Ocultar ajustes":"Configurar"}</button></div>
   <p role="status">{notice}</p>
   {active&&<><small>{activity}</small><button onClick={()=>{pause();camera.stop();setOpen(true);setNotice("Feria detenida. Cámara y micrófono apagados.")}}>Detener feria y dispositivos</button></>}
   {open&&<>
    <p>Preparación: enseña una entrada y una salida con la cámara fija. Después prueba sin voz. Si mueves la cámara, vuelve a calibrar.</p>
    <canvas ref={canvas} width={320} height={240} aria-label="Vista de cámara para configurar recorridos"/>
    <p>{camera.status==="ready"?activity:camera.status==="loading"?"Cargando detector de personas…":"Cámara apagada"}</p>
    {camera.error&&<p role="alert">{camera.error}</p>}
    <div className="fairButtons"><button disabled={camera.status==="loading"||active} onClick={()=>{setTested({entry:false,exit:false});examples.current={entry:[],exit:[]};void camera.start()}}>1. Activar cámara de prueba</button>
    <button disabled={camera.status!=="ready"||Boolean(recording)||active} onClick={()=>learn("entry")}>{recording==="entry"?"Aprendiendo entrada…":"2. Enseñar entrada (6 s)"}</button>
    <button disabled={camera.status!=="ready"||Boolean(recording)||active} onClick={()=>learn("exit")}>{recording==="exit"?"Aprendiendo salida…":"3. Enseñar salida (6 s)"}</button></div>
    <p>{calibration?"Calibración disponible. Prueba sin voz:":"Aún falta calibrar."} Entrada {tested.entry?"✓":"pendiente"} · salida {tested.exit?"✓":"pendiente"}.</p>
    <button disabled={active||camera.status!=="ready"||!calibration||!tested.entry||!tested.exit||Boolean(recording)} onClick={activate}>4. Activar feria con audio</button>
    <div className="fairButtons"><button disabled={!active||!available} onClick={()=>announce("welcome")}>Dar bienvenida</button><button disabled={!active||!available||activity.startsWith("Entrada")} onClick={()=>announce("goodbye")}>Despedir</button></div>
    <small>El análisis de personas ocurre en este equipo. Solo se guarda la calibración, sin imágenes ni identidad. La dirección se estima por el recorrido; una espalda por sí sola no confirma una salida. No es un contador de asistencia.</small>
   </>}
  </aside>
 </div>;
}
