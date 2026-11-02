"use client";
import {useCallback,useEffect,useRef} from "react";
import {microphoneConstraints,SpeechEndpoint,type MicrophonePreferences} from "@/lib/microphone";

const MAX_RECORD_MS=15_000;
const NO_VOICE_MS=6_000;

function chooseFormat(){
 if(typeof MediaRecorder==="undefined")throw new Error("Grabación no disponible");
 const types=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg"];
 return types.find(type=>MediaRecorder.isTypeSupported(type))||"";
}

/** 15-second maximum, silence-terminated ephemeral audio. Nothing persisted. */
async function capturePhrase(language:string,reduceNoise:boolean,signal:AbortSignal,preferences:MicrophonePreferences,brief:boolean):Promise<Blob|null>{
 if(!navigator.mediaDevices?.getUserMedia)throw new Error("No hay micrófono disponible");
 if(signal.aborted)throw new DOMException("Cancelado","AbortError");
 const stream=await navigator.mediaDevices.getUserMedia({audio:microphoneConstraints(reduceNoise,preferences),video:false});
 if(signal.aborted){stream.getTracks().forEach(t=>t.stop());throw new DOMException("Cancelado","AbortError")}
 return new Promise<Blob|null>((resolve,reject)=>{
  let context:AudioContext|null=null,tick:ReturnType<typeof setInterval>|undefined;
  let recorder:MediaRecorder|null=null,done=false;
  const chunks:BlobPart[]=[];
  const started=Date.now(),endpoint=new SpeechEndpoint(brief);
  const release=()=>{
   if(tick)clearInterval(tick);
   signal.removeEventListener("abort",abort);
   stream.getTracks().forEach(t=>t.stop());
   if(context)void context.close().catch(()=>{});
  };
  const finish=(err?:Error,blob?:Blob|null)=>{
   if(done)return;done=true;release();
   if(err)reject(err);else resolve(blob||null);
  };
  const abort=()=>{
   if(recorder&&recorder.state!=="inactive")recorder.stop();
   finish(new DOMException("Cancelado","AbortError"));
  };
  signal.addEventListener("abort",abort,{once:true});
  try{
   const format=chooseFormat();
   recorder=new MediaRecorder(stream,format?{mimeType:format,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000});
   const mime=recorder.mimeType.split(";")[0]||"audio/webm";
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>finish(new Error("No se pudo grabar audio"));
   recorder.onstop=()=>{
    if(done)return;
    const blob=new Blob(chunks,{type:mime});
    finish(undefined,endpoint.voiceSeen&&blob.size>300?blob:null);
   };
   context=new AudioContext();
   void context.resume().catch(()=>finish(new Error("El navegador no pudo activar el análisis de voz")));
   const source=context.createMediaStreamSource(stream);
   const analyser=context.createAnalyser();analyser.fftSize=1024;
   source.connect(analyser);
   const samples=new Uint8Array(analyser.fftSize);
   recorder.start(250);
   tick=setInterval(()=>{
    if(done||!recorder||recorder.state==="inactive")return;
    analyser.getByteTimeDomainData(samples);
    let sum=0;
    for(const sample of samples){const n=(sample-128)/128;sum+=n*n}
    const rms=Math.sqrt(sum/samples.length);
    const now=Date.now();
    const finished=endpoint.update(rms,now);
    if(now-started>MAX_RECORD_MS||(!endpoint.voiceSeen&&now-started>NO_VOICE_MS)||finished)recorder.stop();
   },90);
  }catch(e){finish(e instanceof Error?e:new Error("Grabación no disponible"))}
 });
}

export function useDellSTT(){
 const active=useRef<AbortController|null>(null);
 const cancel=useCallback(()=>{active.current?.abort();active.current=null},[]);
 useEffect(()=>cancel,[cancel]);
 const record=useCallback(async(locale:string,reduceNoise:boolean,preferences:MicrophonePreferences={},brief=false)=>{
  cancel();
  const controller=new AbortController();active.current=controller;
  try{
   const blob=await capturePhrase(locale,reduceNoise,controller.signal,preferences,brief);
   if(!blob)return "";
   if(blob.size>2_500_000)throw new Error("Audio demasiado grande");
   const lang=locale.split("-")[0].toLowerCase();
   const res=await fetch("/api/stt",{
    method:"POST",signal:controller.signal,cache:"no-store",
    headers:{"Content-Type":blob.type,"X-Suu-Language":lang},
    body:blob
   });
   if(!res.ok)throw new Error("STT del Dell temporalmente no disponible");
   const data=await res.json();
   if(typeof data.text!=="string")throw new Error("Transcripción inválida");
   return data.text.trim().slice(0,3000);
  }finally{if(active.current===controller)active.current=null}
 },[cancel]);
 return {record,cancel};
}
