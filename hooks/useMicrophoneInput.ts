"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {startMicrophoneRecognition,type RecognitionInput,type MicrophoneMode} from "@/lib/microphone";
export function useMicrophoneInput(){
 const stream=useRef<MediaStream|null>(null),generation=useRef(0);
 const [mode,setMode]=useState<MicrophoneMode>("off");
 const stop=useCallback(()=>{generation.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setMode("off")},[]);
 const start=useCallback(async(rec:RecognitionInput,reduceNoise:boolean)=>{
  stop();const ticket=generation.current;
  try{
   const result=await startMicrophoneRecognition(rec,reduceNoise&&Boolean(navigator.mediaDevices?.getUserMedia),{userAgent:navigator.userAgent,capture:audio=>navigator.mediaDevices.getUserMedia({audio,video:false})},()=>ticket!==generation.current);
   if(!result)return false;
   if(ticket!==generation.current){result.stream?.getTracks().forEach(t=>t.stop());return false}
   stream.current=result.stream||null;setMode(result.mode);return true;
  }catch(e){if(ticket===generation.current)stop();throw e}
 },[stop]);
 useEffect(()=>stop,[stop]);
 return {mode,start,stop};
}
