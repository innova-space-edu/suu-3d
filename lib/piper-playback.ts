import {requestPiperAudio} from "@/lib/piper-client";

/** Piper accepts short phrases. Start audio on the first phrase, synthesize the
 * next one while the current clip plays, and never run concurrent CPU jobs.
 * Payloads stay in memory and the caller owns URL/player cleanup.
 */
export function splitPiperSpeech(text:string):string[]{
 let remaining=text.trim().slice(0,700);
 const phrases:string[]=[];
 while(remaining){
  const limit=phrases.length===0?135:230;
  if(remaining.length<=limit){phrases.push(remaining);break}
  const front=remaining.slice(0,limit+1);
  let cut=0;
  // Prefer punctuation at natural boundaries, but never create a tiny clip.
  const punctuation=/[.!?;:](?=\s)/g;
  for(const match of front.matchAll(punctuation)){
   const end=(match.index||0)+1;
   if(end>=limit*.55)cut=end;
  }
  if(!cut){
   const lastSpace=front.lastIndexOf(" ");
   cut=lastSpace>=limit*.55?lastSpace:limit;
  }
  const phrase=remaining.slice(0,cut).trim();
  if(!phrase){cut=limit;phrases.push(remaining.slice(0,cut))}
  else phrases.push(phrase);
  remaining=remaining.slice(cut).trim();
 }
 return phrases;
}

export type PiperClipHandler=(player:HTMLAudioElement,url:string,phrase:string,part:number)=>void;

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
 let current=await requestPiperAudio(phrases[0],signal);
 for(let part=0;part<phrases.length;part++){
  if(signal.aborted)throw new Error("Reproducción cancelada");
  // Convert rejection into data so an early prefetch failure never leaks an
  // unhandled promise rejection while the previous clip is still playing.
  const next=part+1<phrases.length
   ?requestPiperAudio(phrases[part+1],signal)
     .then(blob=>({ok:true as const,blob}),error=>({ok:false as const,error}))
   :null;
  const url=URL.createObjectURL(current);
  const player=new Audio(url);
  try{onClip(player,url,phrases[part],part)}
  catch(error){URL.revokeObjectURL(url);throw error}
  await playClip(player,signal);
  if(next){
   const result=await next;
   if(!result.ok)throw result.error;
   current=result.blob;
  }
 }
}
