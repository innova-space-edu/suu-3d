"use client";
import {useEffect,useRef,useState} from "react";
import dynamic from "next/dynamic";
import {useLipSync} from "@/hooks/useLipSync";
import {useSpeechMeter} from "@/hooks/useSpeechMeter";
import {fairSpokenText} from "@/lib/speech-text";
import {requestPiperAudio} from "@/lib/piper-client";
import {fairRecordingVoice,prepareFairAudio,playFairAudio,clearFairAudio,type FairClip} from "@/lib/fair-audio";
import type {FairVoiceCommand} from "./SuuVoiceMode";
const Avatar=dynamic(()=>import("./SuuAvatar"),{ssr:false});
export type FairAudioState={ready:boolean;message:string};
type Props={onAudioState:(state:FairAudioState)=>void;text:string;prepare:boolean;enabled:boolean;ttsLocal?:boolean;voiceId:string;language:string;quality:"eco"|"high";solid:boolean;cameraActive:boolean;announcement:FairVoiceCommand|null;onAvailable:(value:boolean)=>void;onAnnouncementEnd:(success:boolean)=>void;onClose:()=>void};
/** Announcement-only renderer: no recognition or microphone hooks are mounted. */
export default function SuuFairNarrator({onAudioState,text,prepare,enabled,ttsLocal,voiceId,language,quality,solid,cameraActive,announcement,onAvailable,onAnnouncementEnd,onClose}:Props){
 const [status,setStatus]=useState("Configura los recorridos para preparar la bienvenida."),[ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[energy,setEnergy]=useState(0),[revision,setRevision]=useState(0),[muted,setMuted]=useState(false);
 const clips=useRef<FairClip[]>([]),generation=useRef<AbortController|null>(null),playback=useRef<AbortController|null>(null),player=useRef<HTMLAudioElement|null>(null),seen=useRef(0);
 const mutedRef=useRef(muted);mutedRef.current=muted;
 const audioState=useRef(onAudioState);audioState.current=onAudioState;
 const available=useRef(onAvailable),ended=useRef(onAnnouncementEnd);available.current=onAvailable;ended.current=onAnnouncementEnd;
 const lips=useLipSync(),meter=useSpeechMeter(setEnergy);
 const targetVoice=fairRecordingVoice(Boolean(ttsLocal),voiceId);
 const local=targetVoice==="piper-dell-configured";
 useEffect(()=>{audioState.current({ready:ready&&!muted,message:muted?"Audio silenciado. Activa el sonido para recibir a los visitantes.":status})},[ready,muted,status]);
 useEffect(()=>{available.current(enabled&&ready&&!playing&&!muted)},[enabled,ready,playing,muted]);
 useEffect(()=>{if(player.current)player.current.muted=muted},[muted]);
 useEffect(()=>{
  if(!prepare)return;
  const ctl=new AbortController();generation.current=ctl;setReady(false);clips.current=[];
  if(!targetVoice){setStatus("Para guardar la bienvenida, selecciona Piper Dell o una voz EDUAI en Configuración. La voz del navegador no permite exportar audio.");return()=>ctl.abort()}
  const voice=targetVoice;
  setStatus("Preparando la grabación completa. Esto solo se hace la primera vez para esta voz y guion.");
  void prepareFairAudio(fairSpokenText(text,language),JSON.stringify([voice,language]),ctl.signal,async(phrase,signal)=>{
   const timeout=AbortSignal.timeout(55000),combined=AbortSignal.any([signal,timeout]);
   if(local)return requestPiperAudio(phrase,combined);
   const res=await fetch("/api/voice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:phrase,voiceId:targetVoice,language,mode:"fair"}),signal:combined});
   if(!res.ok)throw new Error(`No se pudo generar la voz (${res.status}). Reintenta para continuar los fragmentos pendientes.`);
   return res.blob();
  },(done,total)=>{if(!ctl.signal.aborted)setStatus(`Preparando bienvenida: ${done} de ${total} fragmentos.`)}).then(result=>{
   if(ctl.signal.aborted)return;clips.current=result.clips;setReady(true);setStatus(result.persisted?"Bienvenida completa guardada en este navegador. Lista para reutilizar al detectar entradas.":"Bienvenida lista en memoria. El navegador no permitió guardarla; se perderá al cerrar esta página.");
  }).catch(e=>{if(!ctl.signal.aborted)setStatus(e instanceof Error?e.message:"No se pudo preparar la bienvenida.")});
  return()=>{ctl.abort();if(generation.current===ctl)generation.current=null};
 },[prepare,text,targetVoice,language,local,revision]);
 useEffect(()=>{
  if(!enabled){playback.current?.abort();player.current?.pause();lips.stop();meter.stop();setPlaying(false)}
 },[enabled,lips.stop,meter.stop]);
 useEffect(()=>{
  if(!announcement||announcement.id===seen.current||!enabled||!ready||muted)return;
  seen.current=announcement.id;const ctl=new AbortController();playback.current=ctl;setPlaying(true);available.current(false);
  void playFairAudio(clips.current,ctl.signal,(audio,phrase)=>{player.current=audio;audio.muted=mutedRef.current;setStatus(phrase);lips.audio(audio,phrase,[]);void meter.start(audio)}).then(()=>{if(!ctl.signal.aborted){setStatus("Bienvenida terminada. Esperando nuevas entradas; las salidas permanecen en silencio.");ended.current(true)}}).catch(e=>{if(!ctl.signal.aborted){setStatus(e instanceof Error&&e.name==="NotAllowedError"?"El navegador bloqueó el audio. Pulsa Probar bienvenida grabada para habilitarlo.":"No se pudo reproducir la grabación. Revisa el audio.");ended.current(false)}}).finally(()=>{if(playback.current===ctl){playback.current=null;player.current=null;lips.stop();meter.stop();setPlaying(false)}});
  return()=>{ctl.abort()};
 },[announcement,enabled,ready,lips.audio,lips.stop,meter.start,meter.stop]);
 useEffect(()=>()=>{generation.current?.abort();playback.current?.abort();player.current?.pause()},[]);
 return <div className="voiceOnlyOverlay" role="dialog" aria-label="Bienvenida automática sin micrófono" aria-modal="true">
  <header className="voiceHeader"><div><b>SUU</b><span>EXPO CIENCIAS 2026 · BIENVENIDA GRABADA · MICRÓFONO APAGADO</span></div><button onClick={onClose} aria-label="Cerrar bienvenida">×</button></header>
  <div className="voiceScene"><Avatar lipSync={lips.signal} speaking={playing} listening={false} energy={energy} quality={quality} solid={solid} cameraActive={cameraActive}/></div>
  <div className="voiceBottom"><div className="voiceStatus">{playing?"HABLANDO":ready?"GRABACIÓN LISTA":prepare?"PREPARANDO":"EN CONFIGURACIÓN"}</div><p aria-live="polite">{status}</p>
   <div className="voiceControls"><button disabled={!prepare||playing} onClick={()=>{generation.current?.abort();setRevision(v=>v+1)}}>Preparar / reintentar</button><button disabled={!prepare||playing} onClick={()=>{generation.current?.abort();setReady(false);void clearFairAudio().then(()=>setRevision(v=>v+1)).catch(()=>setStatus("No se pudo borrar la grabación."))}}>Regenerar audio</button><button onClick={()=>setMuted(v=>!v)}>{muted?"Activar sonido":"Silenciar"}</button><button onClick={onClose}>Salir</button></div>
   <small>Solo cámara para detectar entradas y salidas. No se solicita micrófono. El audio se guarda en este navegador; si cambias la voz Piper del Dell, usa Regenerar audio.</small>
  </div>
 </div>;
}
