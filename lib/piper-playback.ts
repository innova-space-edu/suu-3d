import {requestPiperAudio} from "@/lib/piper-client";

/** Piper accepts short phrases. Start audio on the first phrase, synthesize the
 * next one while the current clip plays, and never run concurrent CPU jobs.
 * Payloads stay in memory and the caller owns URL/player cleanup.
 */
import {splitPiperSpeech} from "@/lib/piper-chunks.mjs";

export type PiperClipHandler=(player:HTMLAudioElement,url:string,phrase:string,part:number)=>void;

// Deadline applies to each individual phrase, never to the entire reply.
// Users may listen to several clips while subsequent ones are prepared.
async function requestPhrase(phrase:string,signal:AbortSignal):Promise<Blob>{
 const ctl=new AbortController();
 const cancel=()=>ctl.abort();
 signal.addEventListener("abort",cancel,{once:true});
 const timer=setTimeout(()=>ctl.abort(),47000);
 try{
  if(signal.aborted)throw new Error("Reproducción cancelada");
  return await requestPiperAudio(phrase,ctl.signal);
 }finally{
  clearTimeout(timer);
  signal.removeEventListener("abort",cancel);
 }
}

async function playClip(player:HTMLAudioElement,signal:AbortSignal):Promise<void>{
 if(signal.aborted)throw new Error("Reproducción cancelada");
 await new Promise<void>((resolve,reject)=>{
  let settled=false;
  const done=(reason?:unknown)=>{
   if(settled)return;
   settled=true;
   player.removeEventListener("ended",ended);
   player.removeEventListener("error",failed);
   signal.removeEventListener("abort",cancel);
   if(reason)reject(reason);else resolve();
  };
  const ended=()=>done();
  const failed=()=>done(new Error("Audio Piper no pudo reproducirse"));
  const cancel=()=>{player.pause();done(new Error("Reproducción cancelada"))};
  player.addEventListener("ended",ended,{once:true});
  player.addEventListener("error",failed,{once:true});
  signal.addEventListener("abort",cancel,{once:true});
  if(signal.aborted){cancel();return}
  player.play().catch(done);
 });
}

export async function playPiperSpeech(text:string,signal:AbortSignal,onClip:PiperClipHandler):Promise<void>{
 const phrases=splitPiperSpeech(text);
 if(!phrases.length)return;
 return playPiperPhrases((async function*(){yield* phrases})(),signal,onClip);
}

/** Pull phrases while Qwen is still producing text; one synthesis at a time. */
export async function playPiperPhrases(phrases:AsyncIterable<string>,signal:AbortSignal,onClip:PiperClipHandler):Promise<void>{
 const session=new AbortController(),iterator=phrases[Symbol.asyncIterator]();
 const cancel=()=>session.abort();
 signal.addEventListener("abort",cancel,{once:true});
 if(signal.aborted)cancel();
 const prepare=async()=>{
  const item=await iterator.next();
  if(item.done)return null;
  return {phrase:item.value,blob:await requestPhrase(item.value,session.signal)};
 };
 try{
  let current=await prepare(),part=0;
  while(current){
   if(signal.aborted)throw new Error("Reproducción cancelada");
   const next=prepare().then(clip=>({ok:true as const,clip}),error=>({ok:false as const,error}));
   const url=URL.createObjectURL(current.blob),player=new Audio(url);
   try{
    onClip(player,url,current.phrase,part++);
    await playClip(player,signal);
   }finally{player.pause();URL.revokeObjectURL(url)}
   const result=await next;
   if(!result.ok)throw result.error;
   current=result.clip;
  }
 }finally{
  session.abort();
  signal.removeEventListener("abort",cancel);
  // Producers must also stop waiting when their shared signal is cancelled.
  void iterator.return?.().catch(()=>{});
 }
}
