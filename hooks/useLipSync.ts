"use client";
import {useCallback,useEffect,useRef} from "react";
import {buildLipCues,estimatedWords,lipPoseAt,type LipCue,type SpeechWord} from "@/lib/lip-sync";
import type {FacePose} from "@/lib/face-rig";
export type LipPlayback={audio?:HTMLAudioElement;cues:LipCue[];clock?:number;paused?:boolean;kind:"word"|"estimated"|"browser"};
export type LipSignal={current:LipPlayback|null};
export function currentLipPose(signal?:LipSignal):FacePose|undefined{
 const p=signal?.current;if(!p)return undefined;
 if(p.paused||p.audio&&(p.audio.paused||p.audio.ended))return {jaw:0,pucker:0,wide:0,browUp:0};
 return lipPoseAt(p.cues,p.audio?p.audio.currentTime:(performance.now()-(p.clock||0))/1000);
}
export async function readVoiceResponse(response:Response):Promise<{blob:Blob;words:SpeechWord[]}>{
 if(!response.headers.get("content-type")?.includes("application/json"))return {blob:await response.blob(),words:[]};
 const data=await response.json();
 if(typeof data.audio!=="string"||data.audio.length>12000000)throw new Error("Audio inválido");
 const raw=atob(data.audio),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const words=Array.isArray(data.words)?data.words.filter((w:SpeechWord)=>w&&typeof w.text==="string"&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start).slice(0,1200):[];
 return {blob:new Blob([bytes],{type:"audio/mpeg"}),words};
}
export function useLipSync(){
 const signal=useRef<LipPlayback|null>(null),release=useRef<()=>void>(()=>{});
 const stop=useCallback(()=>{release.current();release.current=()=>{};signal.current=null},[]);
 const audio=useCallback((player:HTMLAudioElement,text:string,words:SpeechWord[])=>{
  stop();const playback:LipPlayback={audio:player,cues:buildLipCues(words),kind:words.length?"word":"estimated"};signal.current=playback;
  const metadata=()=>{if(signal.current===playback&&!words.length)playback.cues=buildLipCues(estimatedWords(text,player.duration))};
  player.addEventListener("loadedmetadata",metadata);if(player.readyState)metadata();
  release.current=()=>player.removeEventListener("loadedmetadata",metadata);
 },[stop]);
 const utterance=useCallback((u:SpeechSynthesisUtterance)=>{
  stop();let origin=0,pauseAt=0;
  const start=()=>{origin=performance.now();signal.current={clock:origin,cues:buildLipCues(estimatedWords(u.text,Math.max(.4,u.text.length/(13*u.rate)))),kind:"browser"}};
  const boundary=(e:SpeechSynthesisEvent)=>{
   if(e.name!=="word")return;
   const word=u.text.slice(e.charIndex).match(/^[\p{L}\p{N}]+/u)?.[0];if(!word)return;
   signal.current={clock:performance.now(),cues:buildLipCues([{text:word,start:0,end:Math.max(.12,word.length/(13*u.rate))}]),kind:"browser"};
  };
  const pause=()=>{pauseAt=performance.now();if(signal.current)signal.current.paused=true};
  const resume=()=>{if(signal.current){signal.current.clock=(signal.current.clock||origin)+performance.now()-pauseAt;signal.current.paused=false}};
  u.addEventListener("start",start);u.addEventListener("boundary",boundary);u.addEventListener("pause",pause);u.addEventListener("resume",resume);
  release.current=()=>{u.removeEventListener("start",start);u.removeEventListener("boundary",boundary);u.removeEventListener("pause",pause);u.removeEventListener("resume",resume)};
 },[stop]);
 useEffect(()=>stop,[stop]);
 return {signal,stop,audio,utterance};
}
