"use client";
import {useCallback,useEffect,useRef} from "react";
/** Measures audio that SUU plays, never the microphone. Audio playback survives meter failure. */
export function useSpeechMeter(onEnergy:(n:number)=>void){
 const cleanup=useRef<()=>void>(()=>{}),generation=useRef(0);
 const stop=useCallback(()=>{generation.current++;cleanup.current();cleanup.current=()=>{};onEnergy(0)},[onEnergy]);
 const start=useCallback(async(player:HTMLAudioElement)=>{
  stop();const ticket=generation.current;
  if(typeof AudioContext==="undefined")return;
  let context:AudioContext|undefined;
  try{
   context=new AudioContext();
   cleanup.current=()=>{void context?.close().catch(()=>{})};
   // Do not route playback into a suspended context (which would silence it).
   await Promise.race([context.resume(),new Promise<void>(resolve=>setTimeout(resolve,1000))]);
   if(ticket!==generation.current||context.state!=="running"){void context.close().catch(()=>{});return}
   const source=context.createMediaElementSource(player),analyser=context.createAnalyser();
   analyser.fftSize=512;analyser.smoothingTimeConstant=.65;source.connect(analyser);analyser.connect(context.destination);
   const values=new Float32Array(analyser.fftSize);let frame=0,last=0;
   const sample=(time:number)=>{frame=requestAnimationFrame(sample);if(time-last<33)return;last=time;analyser.getFloatTimeDomainData(values);let sum=0;for(const v of values)sum+=v*v;onEnergy(Math.min(1,Math.max(0,(Math.sqrt(sum/values.length)-.008)*5)))};
   frame=requestAnimationFrame(sample);
   cleanup.current=()=>{cancelAnimationFrame(frame);source.disconnect();analyser.disconnect();void context?.close().catch(()=>{})};
  }catch{if(ticket===generation.current){void context?.close().catch(()=>{});onEnergy(0)}}
 },[onEnergy,stop]);
 useEffect(()=>()=>stop(),[stop]);
 return {start,stop};
}
