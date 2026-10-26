"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {disableNoiseReduction,startMicrophoneRecognition,type RecognitionInput,type MicrophoneMode} from "@/lib/microphone";
import {useHeadphoneOutput} from "./useHeadphoneOutput";
export function useMicrophoneInput(){
 const stream=useRef<MediaStream|null>(null),generation=useRef(0);
 const recognition=useRef<(RecognitionInput&{stop?:()=>void})|null>(null);
 const headphones=useHeadphoneOutput();
 const [mode,setMode]=useState<MicrophoneMode>("off");
 const stop=useCallback(()=>{generation.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setMode("off")},[]);
 const start=useCallback(async(rec:RecognitionInput,reduceNoise:boolean)=>{
  stop();const ticket=generation.current;
  try{
   const connected=await headphones.refresh();
   if(ticket!==generation.current)return false;
   recognition.current=rec;
   const result=await startMicrophoneRecognition(rec,reduceNoise&&connected&&Boolean(navigator.mediaDevices?.getUserMedia),{userAgent:navigator.userAgent,capture:async audio=>{
    const captured=await navigator.mediaDevices.getUserMedia({audio,video:false});
    try{
     // Recheck after permission/capture: the headset may have been unplugged while waiting.
     if(!await headphones.refresh())await Promise.all(captured.getAudioTracks().map(disableNoiseReduction));
     return captured;
    }catch(e){captured.getTracks().forEach(track=>track.stop());throw e}
   }},()=>ticket!==generation.current);
   if(!result)return false;
   if(ticket!==generation.current){result.stream?.getTracks().forEach(t=>t.stop());return false}
   stream.current=result.stream||null;setMode(result.mode);return true;
  }catch(e){if(ticket===generation.current)stop();throw e}
 },[stop,headphones.refresh]);
 useEffect(()=>{
  if(headphones.active||!stream.current)return;
  const captured=stream.current;let cancelled=false;
  void Promise.all(captured.getAudioTracks().map(disableNoiseReduction)).then(()=>{
   if(!cancelled&&stream.current===captured)setMode("browser");
  }).catch(()=>{
   if(!cancelled&&stream.current===captured){stop();recognition.current?.stop?.()}
  });
  return()=>{cancelled=true};
 },[headphones.active,stop]);
 useEffect(()=>stop,[stop]);
 return {mode,start,stop,headphonesActive:headphones.active};
}
