"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useMicrophoneInput} from "@/hooks/useMicrophoneInput";
import {useDellSTT} from "@/hooks/useDellSTT";
import {spokenText,fairSpokenText,fairAudienceText} from "@/lib/speech-text";
import {useLipSync,readVoiceResponse} from "@/hooks/useLipSync";
import {useSpeechMeter} from "@/hooks/useSpeechMeter";
import {selectBrowserVoice} from "@/lib/browser-voice";
import {preferOnDeviceRecognition} from "@/lib/local-recognition";
import {fairResponse} from "@/lib/fair-response";
import dynamic from "next/dynamic";
import {Mic,MicOff,Volume2,VolumeX,X,AudioLines} from "lucide-react";
import type {ChatMessage,Domain} from "@/lib/providers";
import type {FaceMotion} from "@/hooks/useSuuFaceTracking";
// Bounded, tab-local audio reuse: no visitor text is persisted to disk.
const fairAudioCache=new Map<string,Awaited<ReturnType<typeof readVoiceResponse>>>();
let fairAudioBytes=0;
const Avatar=dynamic(()=>import("./SuuAvatar"),{ssr:false});
type SpeechResult={results:Record<number,Record<number,{transcript:string}>>};
type Recognition={processLocally?:boolean;lang:string;continuous:boolean;interimResults:boolean;onresult:((event:SpeechResult)=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;onspeechstart:(()=>void)|null;onspeechend:(()=>void)|null;start(track?:MediaStreamTrack):void;stop():void};
type RecognitionConstructor=new()=>Recognition;
export type FairVoiceCommand={id:number;text:string};
type Props={sttAvailable?:boolean;modeLabel?:string;fairMode?:boolean;enabled?:boolean;announcement?:FairVoiceCommand|null;onAnnouncementEnd?:(success:boolean)=>void;onAvailable?:(available:boolean)=>void;noiseReduction:boolean;onClose:()=>void;onTurn:(user:string,reply:string,provider:string)=>void;initial:ChatMessage[];domain:Domain;voiceId:string;language:string;quality:"eco"|"high";solid:boolean;tracking?:FaceMotion;cameraActive:boolean};
export default function SuuVoiceMode({sttAvailable=false,modeLabel,fairMode=false,enabled,announcement,onAnnouncementEnd,onAvailable,noiseReduction,onClose,onTurn,initial,domain,voiceId,language,quality,solid,tracking,cameraActive}:Props){
 const [phase,setPhase]=useState<"idle"|"listening"|"thinking"|"speaking"|"error">("idle");
 const [subtitle,setSubtitle]=useState("Activa el micrófono para conversar con SUU.");
 const caption=useRef<HTMLParagraphElement|null>(null);
 useEffect(()=>{if(caption.current)caption.current.scrollTop=0},[subtitle]);
 const [provider,setProvider]=useState(""),[muted,setMuted]=useState(false),[energy,setEnergy]=useState(.04);
 const microphone=useMicrophoneInput();
 const stt=useDellSTT();
 const meter=useSpeechMeter(setEnergy);
 const lips=useLipSync();
 const speechGeneration=useRef(0),recognitionGeneration=useRef(0),humanSpeaking=useRef(false),announcing=useRef(false);
 const endRef=useRef(onAnnouncementEnd),availableRef=useRef(onAvailable);endRef.current=onAnnouncementEnd;availableRef.current=onAvailable;
 const reportAvailable=()=>availableRef.current?.(!stopSignal.current&&!announcing.current&&!humanSpeaking.current&&(phaseRef.current==="idle"||phaseRef.current==="listening"));
 const recognizer=useRef<Recognition|null>(null),audio=useRef<HTMLAudioElement|null>(null),audioUrl=useRef<string|null>(null);
 const onTurnRef=useRef(onTurn),stopSignal=useRef(false),history=useRef(initial.slice(-14)),abort=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),phaseRef=useRef("idle"),listeningRef=useRef(false);
 onTurnRef.current=onTurn;
 const setPhaseNow=(next:typeof phase)=>{phaseRef.current=next;setPhase(next);reportAvailable()};
 const releaseAudio=useCallback(()=>{speechGeneration.current++;lips.stop();meter.stop();if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.pause();audio.current.src="";audio.current=null}if(audioUrl.current){URL.revokeObjectURL(audioUrl.current);audioUrl.current=null}if(timer.current){clearInterval(timer.current);timer.current=null}if(typeof window!=="undefined")window.speechSynthesis?.cancel();setEnergy(0)},[meter.stop,lips.stop]);
 const stop=useCallback(()=>{stopSignal.current=true;stt.cancel();abort.current?.abort();abort.current=null;recognitionGeneration.current++;humanSpeaking.current=false;announcing.current=false;recognizer.current?.stop();microphone.stop();recognizer.current=null;listeningRef.current=false;releaseAudio();setPhaseNow("idle");setSubtitle("Conversación pausada. Pulsa para reanudar.");},[releaseAudio,microphone.stop,stt.cancel]);
 useEffect(()=>()=>{stopSignal.current=true;abort.current?.abort();recognizer.current?.stop();microphone.stop();releaseAudio()},[releaseAudio,microphone.stop]);
 const finishSpeech=(success=true)=>{releaseAudio();if(announcing.current){announcing.current=false;endRef.current?.(success)}setPhaseNow("idle");restart()};
 const restart=()=>{if(stopSignal.current)return;window.setTimeout(()=>{if(!stopSignal.current)void listen()},250)};
 const speak=async(text:string)=>{
  const displayText=fairMode?fairAudienceText(text):text;
  const speechLocale=(voiceId.startsWith("browser:")?window.speechSynthesis?.getVoices().find(v=>"browser:"+v.voiceURI===voiceId)?.lang:voiceId.match(/^[a-z]{2}-[A-Z]{2}/)?.[0])||language;
  text=(fairMode?fairSpokenText:spokenText)(text,speechLocale);
  if(stopSignal.current)return;
  if(!text){finishSpeech();return}
  if(muted){finishSpeech(false);return}
  releaseAudio();const ticket=speechGeneration.current;setPhaseNow("speaking");setSubtitle(displayText);
  const options=window.speechSynthesis?.getVoices()||[];
  const installed=selectBrowserVoice(options,voiceId,speechLocale);
  // browser:preferred is local first with an explicit remote fallback only
  // when there is no installed voice. browser:auto is strictly device-only.
  const requestRemote=!voiceId.startsWith("browser:")||(voiceId==="browser:preferred"&&!installed);
  if(requestRemote){
   try{
    const remoteId=voiceId==="browser:preferred"?"es-MX-DaliaNeural":voiceId;
    const cacheKey=JSON.stringify([remoteId,speechLocale,text.slice(0,1900)]);
    let recording=fairMode?fairAudioCache.get(cacheKey):undefined;
    if(!recording){
     const res=await fetch("/api/voice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:text.slice(0,1900),voiceId:remoteId,language:speechLocale,mode:fairMode?"fair":undefined,timings:true}),signal:abort.current?.signal});
     if(!res.ok)throw new Error("No hay motor de voz en línea");
     recording=await readVoiceResponse(res);
     if(fairMode&&recording.blob.size<=8000000){
      while(fairAudioCache.size&&(fairAudioBytes+recording.blob.size>24000000||fairAudioCache.size>=60)){
       const oldest=fairAudioCache.keys().next().value!;fairAudioBytes-=fairAudioCache.get(oldest)!.blob.size;fairAudioCache.delete(oldest);
      }
      fairAudioCache.set(cacheKey,recording);fairAudioBytes+=recording.blob.size;
     }
    }
    const {blob,words}=recording;
    if(stopSignal.current||ticket!==speechGeneration.current)return;
    audioUrl.current=URL.createObjectURL(blob);const player=new Audio(audioUrl.current);audio.current=player;
    lips.audio(player,text.slice(0,1900),words);
    player.onended=()=>finishSpeech();player.onerror=()=>finishSpeech(false);
    void meter.start(player);await player.play();return;
   }catch{if(ticket!==speechGeneration.current)return;releaseAudio()}
  }
  if(stopSignal.current)return;
  const localVoice=selectBrowserVoice(window.speechSynthesis?.getVoices()||[],voiceId,speechLocale);
  if(!localVoice){
   setPhaseNow("error");
   setSubtitle("No hay voz instalada para este idioma. Instala una voz en el dispositivo o selecciona una voz EDUAI en Configuración.");
   if(announcing.current){announcing.current=false;endRef.current?.(false)}
   return;
  }
  const browserTicket=speechGeneration.current;
  const words=new SpeechSynthesisUtterance(text.slice(0,2400));words.lang=speechLocale;words.rate=1;words.voice=localVoice;
  words.onstart=()=>{if(browserTicket!==speechGeneration.current||stopSignal.current)return;let t=0;timer.current=setInterval(()=>{t+=.85;setEnergy(.15+.32*Math.abs(Math.sin(t)))},90)};
  words.onend=()=>{if(browserTicket===speechGeneration.current&&!stopSignal.current)finishSpeech()};
  words.onerror=()=>{if(browserTicket===speechGeneration.current&&!stopSignal.current)finishSpeech(false)};
  lips.utterance(words);window.speechSynthesis.speak(words);
 };
 const converse=async(text:string)=>{
  if(stopSignal.current)return;
  setPhaseNow("thinking");setSubtitle("SUU está preparando su respuesta...");
  const messages=[...history.current,{role:"user" as const,content:text}].slice(-16);history.current=messages;
  const ctl=new AbortController();abort.current=ctl;
  try{
   let data:{reply?:string;provider?:string};
   if(fairMode)data={reply:fairResponse(messages),provider:"Catálogo Expo · local"};
   else{
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},signal:ctl.signal,body:JSON.stringify({messages,domain})});
    data=await response.json();
    if(!response.ok)throw new Error((data as {error?:string}).error||"Error de conversación");
   }
   if(stopSignal.current)return;
   const rawReply=String(data.reply||"").trim();const reply=fairMode?fairAudienceText(rawReply):rawReply;if(!reply)throw new Error("SUU no generó una respuesta");
   history.current=[...messages,{role:"assistant" as const,content:reply}].slice(-16);
   setProvider(String(data.provider||""));onTurnRef.current(text,reply,String(data.provider||""));
   await speak(reply);
  }catch(e){if(stopSignal.current)return;setPhaseNow("error");setSubtitle(e instanceof Error?e.message:"No se pudo completar la respuesta. Pulsa el micrófono para reintentar.")}
 };
 async function listen(){
  if(stopSignal.current||listeningRef.current)return;
  if(sttAvailable){
   const generation=++recognitionGeneration.current;
   listeningRef.current=true;setPhaseNow("listening");setSubtitle("Escuchando con transcripción del Dell…");
   try{
    const transcript=await stt.record(language,noiseReduction);
    if(stopSignal.current||generation!==recognitionGeneration.current)return;
    listeningRef.current=false;
    if(transcript){setSubtitle("Tú: "+transcript);void converse(transcript)}
    else {setPhaseNow("idle");restart()}
    return;
   }catch(e){
    if(stopSignal.current||generation!==recognitionGeneration.current)return;
    listeningRef.current=false;
    if(e instanceof Error&&e.name==="AbortError")return;
    setSubtitle("STT Dell no disponible. Activando reconocimiento del navegador…");
   }
  }
  const web=window as Window & {webkitSpeechRecognition?:RecognitionConstructor;SpeechRecognition?:RecognitionConstructor};
  const Constructor=web.SpeechRecognition||web.webkitSpeechRecognition;
  if(!Constructor){setPhaseNow("error");setSubtitle("Para conversación continua usa Chrome o Edge con permiso de micrófono.");return}
  const r=new Constructor();recognizer.current=r;r.lang=language;r.continuous=false;r.interimResults=false;
  await preferOnDeviceRecognition(Constructor,r,language);
  const recognitionTicket=++recognitionGeneration.current;
  let transcript="",failed=false;
  r.onspeechstart=()=>{if(recognitionTicket!==recognitionGeneration.current)return;humanSpeaking.current=true;reportAvailable()};
  r.onspeechend=()=>{};
  r.onresult=e=>{if(recognitionTicket!==recognitionGeneration.current)return;humanSpeaking.current=true;reportAvailable();transcript=e.results[0]?.[0]?.transcript?.trim()||"";if(transcript)setSubtitle("Tú: "+transcript)};
  r.onerror=e=>{if(recognitionTicket!==recognitionGeneration.current)return;if(fairMode&&e.error==="no-speech")return;humanSpeaking.current=false;microphone.stop();failed=true;listeningRef.current=false;if(stopSignal.current)return;setPhaseNow("error");setSubtitle(e.error==="not-allowed"?"Habilita el micrófono en los permisos del navegador.":"No se reconoció la voz. Pulsa para intentarlo de nuevo.")};
  r.onend=()=>{if(recognitionTicket!==recognitionGeneration.current)return;humanSpeaking.current=false;microphone.stop();listeningRef.current=false;if(stopSignal.current||failed)return;if(transcript)void converse(transcript);else {setPhaseNow("idle");restart()}};
  try{listeningRef.current=true;setPhaseNow("listening");setSubtitle("Preparando micrófono...");if(!await microphone.start(r,noiseReduction)){if(recognitionTicket===recognitionGeneration.current)listeningRef.current=false;return}if(stopSignal.current||recognitionTicket!==recognitionGeneration.current){microphone.stop();listeningRef.current=false;return}setSubtitle("Escuchando... habla con naturalidad.");}catch{listeningRef.current=false;setPhaseNow("error");setSubtitle("No se pudo iniciar el micrófono.")}
 }
 const speakRef=useRef(speak);speakRef.current=speak;
 const commandSeen=useRef(0);
 useEffect(()=>{
  if(!announcement||announcement.id===commandSeen.current)return;
  commandSeen.current=announcement.id;
  recognitionGeneration.current++;stt.cancel();recognizer.current?.stop();recognizer.current=null;microphone.stop();listeningRef.current=false;humanSpeaking.current=false;
  stopSignal.current=false;announcing.current=true;availableRef.current?.(false);
  void speakRef.current(announcement.text);
 },[announcement,microphone.stop]);
 const listenRef=useRef(listen);listenRef.current=listen;
 useEffect(()=>{if(enabled===undefined)return;if(enabled){stopSignal.current=false;void listenRef.current()}else {stop();if(fairMode)setSubtitle("Configura los recorridos y activa la feria con audio para comenzar.")}},[enabled,stop,fairMode]);
 const toggle=()=>{if(announcing.current){stop();announcing.current=false;endRef.current?.(false);return}if(phaseRef.current!=="idle"&&phaseRef.current!=="error"){stop();return}stopSignal.current=false;void listen()};
 return <div className="voiceOnlyOverlay" role="dialog" aria-label="Modo conversación de voz con SUU" aria-modal="true">
  <header className="voiceHeader"><div><b>SUU</b><span>{modeLabel||(fairMode?"EXPO CIENCIAS 2026":"CONVERSACIÓN SOLO VOZ")} · {provider||"LISTA"}</span></div><button onClick={()=>{stop();onClose()}} aria-label="Cerrar modo voz"><X size={25}/></button></header>
  <div className="voiceScene"><Avatar lipSync={lips.signal} speaking={phase==="speaking"} listening={phase==="listening"} energy={energy} quality={quality} solid={solid} tracking={tracking} cameraActive={cameraActive}/></div>
  <div className="voiceBottom"><div className={"voiceStatus "+phase}><AudioLines size={19}/><span>{phase==="listening"?"ESCUCHANDO":phase==="thinking"?"PENSANDO":phase==="speaking"?"HABLANDO":phase==="error"?"REINTENTAR":"EN ESPERA"}</span></div>
   <p ref={caption} aria-live="polite" tabIndex={0} aria-label="Respuesta de SUU">{subtitle}</p>
   <div className="voiceControls"><button className="voiceRound" disabled={fairMode&&enabled===false} onClick={toggle} title={phase==="idle"||phase==="error"?"Iniciar voz":"Pausar voz"}>{phase==="idle"||phase==="error"?<Mic size={27}/>:<MicOff size={27}/>}</button><button className="voiceSmall" onClick={()=>setMuted(v=>!v)} title={muted?"Activar audio":"Silenciar audio"}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button><button className="voiceSmall" onClick={()=>{stop();onClose()}}>Salir</button></div>
   <small>{phase==="listening"&&(microphone.mode==="standard"?"Reducción estándar activa. ":"Entrada gestionada por el navegador. ")}Voz instalada del dispositivo prioritaria. {sttAvailable?"Transcripción de audio mediante el Dell protegido; el navegador queda como respaldo.":"Transcripción mediante navegador; el STT del Dell se activará cuando esté configurado."} La escucha se reanuda al terminar y el micrófono se detiene al cerrar o pausar.</small>
  </div>
 </div>;
}
