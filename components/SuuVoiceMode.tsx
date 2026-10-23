"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useLipSync,readVoiceResponse} from "@/hooks/useLipSync";
import {useSpeechMeter} from "@/hooks/useSpeechMeter";
import dynamic from "next/dynamic";
import {Mic,MicOff,Volume2,VolumeX,X,AudioLines} from "lucide-react";
import type {ChatMessage,Domain} from "@/lib/providers";
import type {FaceMotion} from "@/hooks/useSuuFaceTracking";
const Avatar=dynamic(()=>import("./SuuAvatar"),{ssr:false});
type SpeechResult={results:Record<number,Record<number,{transcript:string}>>};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:SpeechResult)=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start():void;stop():void};
type RecognitionConstructor=new()=>Recognition;
type Props={onClose:()=>void;onTurn:(user:string,reply:string,provider:string)=>void;initial:ChatMessage[];domain:Domain;voiceId:string;language:string;quality:"eco"|"high";solid:boolean;tracking?:FaceMotion;cameraActive:boolean};
export default function SuuVoiceMode({onClose,onTurn,initial,domain,voiceId,language,quality,solid,tracking,cameraActive}:Props){
 const [phase,setPhase]=useState<"idle"|"listening"|"thinking"|"speaking"|"error">("idle");
 const [subtitle,setSubtitle]=useState("Activa el micrófono para conversar con SUU.");
 const [provider,setProvider]=useState(""),[muted,setMuted]=useState(false),[energy,setEnergy]=useState(.04);
 const meter=useSpeechMeter(setEnergy);
 const lips=useLipSync();
 const speechGeneration=useRef(0);
 const recognizer=useRef<Recognition|null>(null),audio=useRef<HTMLAudioElement|null>(null),audioUrl=useRef<string|null>(null);
 const onTurnRef=useRef(onTurn),stopSignal=useRef(false),history=useRef(initial.slice(-14)),abort=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),phaseRef=useRef("idle"),listeningRef=useRef(false);
 onTurnRef.current=onTurn;
 const setPhaseNow=(next:typeof phase)=>{phaseRef.current=next;setPhase(next)};
 const releaseAudio=useCallback(()=>{speechGeneration.current++;lips.stop();meter.stop();if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.pause();audio.current.src="";audio.current=null}if(audioUrl.current){URL.revokeObjectURL(audioUrl.current);audioUrl.current=null}if(timer.current){clearInterval(timer.current);timer.current=null}if(typeof window!=="undefined")window.speechSynthesis?.cancel();setEnergy(0)},[meter.stop,lips.stop]);
 const stop=useCallback(()=>{stopSignal.current=true;abort.current?.abort();abort.current=null;recognizer.current?.stop();recognizer.current=null;listeningRef.current=false;releaseAudio();setPhaseNow("idle");setSubtitle("Conversación pausada. Pulsa para reanudar.");},[releaseAudio]);
 useEffect(()=>()=>{stopSignal.current=true;abort.current?.abort();recognizer.current?.stop();releaseAudio()},[releaseAudio]);
 const restart=()=>{if(stopSignal.current)return;window.setTimeout(()=>{if(!stopSignal.current)void listen()},250)};
 const speak=async(text:string)=>{
  if(stopSignal.current)return;
  if(muted){setPhaseNow("idle");restart();return}
  releaseAudio();const ticket=speechGeneration.current;setPhaseNow("speaking");setSubtitle(text);let started=false;
  if(!voiceId.startsWith("browser:")){
   try{
    const res=await fetch("/api/voice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:text.slice(0,1900),voiceId,timings:true}),signal:abort.current?.signal});
    if(!res.ok)throw new Error("No hay motor de voz en línea");
    const {blob,words}=await readVoiceResponse(res);
    if(stopSignal.current||ticket!==speechGeneration.current)return;
    audioUrl.current=URL.createObjectURL(blob);const player=new Audio(audioUrl.current);audio.current=player;lips.audio(player,text.slice(0,1900),words);
    player.onended=()=>{releaseAudio();setPhaseNow("idle");restart()};
    player.onerror=()=>{releaseAudio();setPhaseNow("idle");restart()};
    void meter.start(player);
    started=true;await player.play();
   }catch{if(ticket!==speechGeneration.current)return;releaseAudio();started=false}
  }
  if(started||stopSignal.current)return;
  if(!("speechSynthesis" in window)){setPhaseNow("error");setSubtitle("No se encontró ningún sintetizador de voz.");return}
  const words=new SpeechSynthesisUtterance(text.slice(0,2400));
  words.lang=language;words.rate=1;const options=window.speechSynthesis.getVoices();
  words.voice=options.find(v=>voiceId==="browser:"+v.voiceURI)||options.find(v=>v.lang.toLowerCase()===language.toLowerCase())||null;
  words.onstart=()=>{let t=0;timer.current=setInterval(()=>{t+=.85;setEnergy(.15+.32*Math.abs(Math.sin(t)))},90)};
  words.onend=()=>{releaseAudio();setPhaseNow("idle");restart()};
  words.onerror=()=>{releaseAudio();setPhaseNow("idle");restart()};
  lips.utterance(words);window.speechSynthesis.speak(words);
 };
 const converse=async(text:string)=>{
  if(stopSignal.current)return;
  setPhaseNow("thinking");setSubtitle("SUU está preparando su respuesta...");
  const messages=[...history.current,{role:"user" as const,content:text}].slice(-16);history.current=messages;
  const ctl=new AbortController();abort.current=ctl;
  try{
   const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},signal:ctl.signal,body:JSON.stringify({messages,domain})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Error de conversación");
   if(stopSignal.current)return;
   const reply=String(data.reply||"").trim();if(!reply)throw new Error("SUU no generó una respuesta");
   history.current=[...messages,{role:"assistant" as const,content:reply}].slice(-16);
   setProvider(String(data.provider||""));onTurnRef.current(text,reply,String(data.provider||""));
   await speak(reply);
  }catch(e){if(stopSignal.current)return;setPhaseNow("error");setSubtitle(e instanceof Error?e.message:"No se pudo completar la respuesta. Pulsa el micrófono para reintentar.")}
 };
 async function listen(){
  if(stopSignal.current||listeningRef.current)return;
  const web=window as Window & {webkitSpeechRecognition?:RecognitionConstructor;SpeechRecognition?:RecognitionConstructor};
  const Constructor=web.SpeechRecognition||web.webkitSpeechRecognition;
  if(!Constructor){setPhaseNow("error");setSubtitle("Para conversación continua usa Chrome o Edge con permiso de micrófono.");return}
  const r=new Constructor();recognizer.current=r;r.lang=language;r.continuous=false;r.interimResults=false;
  let transcript="",failed=false;
  r.onresult=e=>{transcript=e.results[0]?.[0]?.transcript?.trim()||"";if(transcript)setSubtitle("Tú: "+transcript)};
  r.onerror=e=>{failed=true;listeningRef.current=false;if(stopSignal.current)return;setPhaseNow("error");setSubtitle(e.error==="not-allowed"?"Habilita el micrófono en los permisos del navegador.":"No se reconoció la voz. Pulsa para intentarlo de nuevo.")};
  r.onend=()=>{listeningRef.current=false;if(stopSignal.current||failed)return;if(transcript)void converse(transcript);else {setPhaseNow("idle");restart()}};
  try{r.start();listeningRef.current=true;setPhaseNow("listening");setSubtitle("Escuchando... habla con naturalidad.");}catch{listeningRef.current=false;setPhaseNow("error");setSubtitle("No se pudo iniciar el micrófono.")}
 }
 const toggle=()=>{if(phaseRef.current!=="idle"&&phaseRef.current!=="error"){stop();return}stopSignal.current=false;void listen()};
 return <div className="voiceOnlyOverlay" role="dialog" aria-label="Modo conversación de voz con SUU" aria-modal="true">
  <header className="voiceHeader"><div><b>SUU</b><span>CONVERSACIÓN SOLO VOZ · {provider||"LISTA"}</span></div><button onClick={()=>{stop();onClose()}} aria-label="Cerrar modo voz"><X size={25}/></button></header>
  <div className="voiceScene"><Avatar lipSync={lips.signal} speaking={phase==="speaking"} listening={phase==="listening"} energy={energy} quality={quality} solid={solid} tracking={tracking} cameraActive={cameraActive}/></div>
  <div className="voiceBottom"><div className={"voiceStatus "+phase}><AudioLines size={19}/><span>{phase==="listening"?"ESCUCHANDO":phase==="thinking"?"PENSANDO":phase==="speaking"?"HABLANDO":phase==="error"?"REINTENTAR":"EN ESPERA"}</span></div>
   <p aria-live="polite">{subtitle}</p>
   <div className="voiceControls"><button className="voiceRound" onClick={toggle} title={phase==="idle"||phase==="error"?"Iniciar voz":"Pausar voz"}>{phase==="idle"||phase==="error"?<Mic size={27}/>:<MicOff size={27}/>}</button><button className="voiceSmall" onClick={()=>setMuted(v=>!v)} title={muted?"Activar audio":"Silenciar audio"}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button><button className="voiceSmall" onClick={()=>{stop();onClose()}}>Salir</button></div>
   <small>La escucha se reanuda automáticamente cuando SUU termina de responder. El micrófono se detiene al cerrar o pausar.</small>
  </div>
 </div>;
}
