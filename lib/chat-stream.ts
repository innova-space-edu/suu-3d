import type {ChatMessage,Domain} from "@/lib/providers";
import {spokenText} from "@/lib/speech-text";
import {playPiperPhrases,type PiperClipHandler} from "@/lib/piper-playback";

export type StreamReply={reply:string;provider:string;fallbackUsed?:boolean;bridgeWarning?:string;timing?:{firstTextMs:number;totalMs:number;delivery?:string}};

/** A bounded, per-conversation queue. Closing/failing wakes a pending consumer. */
export class PhraseQueue implements AsyncIterable<string>{
 private values:string[]=[];
 private closed=false;
 private failure:unknown;
 private wake:(()=>void)|undefined;
 push(value:string){if(!this.closed)this.values.push(value);this.wake?.()}
 close(){this.closed=true;this.wake?.()}
 fail(error:unknown){this.failure=error;this.values=[];this.close()}
 async *[Symbol.asyncIterator](){
  try{
   while(true){
    if(this.failure)throw this.failure;
    const value=this.values.shift();
    if(value!==undefined){yield value;continue}
    if(this.closed)return;
    await new Promise<void>(resolve=>{this.wake=resolve});
    this.wake=undefined;
   }
  }finally{this.values=[];this.close()}
 }
}

/** Streaming splitter does not cut words when a token happens to end mid-word. */
export class SpeechBuffer{
 private pending="";
 private received=0;
 private part=0;
 constructor(private output:(text:string)=>void,private locale="es-CL"){}
 add(delta:string){
  const take=delta.slice(0,Math.max(0,700-this.received));
  this.received+=take.length;this.pending+=take;this.drain(this.received>=700);
 }
 finish(){this.drain(true)}
 private drain(final:boolean){
  while(this.pending.trim()){
   const limit=this.part===0?60:150;
   const front=this.pending.slice(0,limit+1);
   const boundary=/[.!?;:](?=\s)/g;
   let cut=0;
   for(const match of front.matchAll(boundary)){
    const end=match.index+1;
    if(end>=20){cut=end;break}
   }
   if(!cut&&this.pending.length>limit){
    cut=front.lastIndexOf(" ");
    if(cut<limit*.55)cut=limit;
   }
   if(!cut){if(!final)return;cut=this.pending.length}
   const phrase=spokenText(this.pending.slice(0,cut),this.locale);
   this.pending=this.pending.slice(cut).trimStart();
   if(phrase){this.output(phrase);this.part++}
  }
 }
}

export async function requestStreamedChat(messages:ChatMessage[],domain:Domain,signal:AbortSignal,onDelta:(text:string)=>void):Promise<StreamReply>{
 const response=await fetch("/api/chat",{method:"POST",cache:"no-store",signal,
  headers:{"Content-Type":"application/json"},body:JSON.stringify({messages,domain,stream:true})});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"No se pudo responder")}
 // Compatibility with an older deployment serving JSON during a rolling update.
 if(!response.headers.get("content-type")?.includes("application/x-ndjson")){
  const data=await response.json();
  if(typeof data.reply!=="string"||!data.reply.trim())throw new Error("Respuesta inválida");
  onDelta(data.reply);return data;
 }
 if(!response.body)throw new Error("Respuesta vacía");
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer="",text="",result:StreamReply|undefined;
 const event=(line:string)=>{
  if(!line.trim())return;
  const data=JSON.parse(line);
  if(result)throw new Error("Eventos después del final");
  if(data.type==="error")throw new Error(data.error||"Respuesta interrumpida");
  if(data.type==="delta"){
   if(typeof data.text!=="string"||text.length+data.text.length>12000)throw new Error("Fragmento inválido");
   text+=data.text;onDelta(data.text);
  }else if(data.type==="done"){
   if(typeof data.reply!=="string"||!data.reply.trim()||data.reply!==text)throw new Error("Respuesta incompleta");
   result=data;
  }
 };
 try{
  while(true){
   const {value,done}=await reader.read();
   buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
   if(buffer.length>65536)throw new Error("Respuesta excesiva");
   let end:number;
   while((end=buffer.indexOf("\n"))>=0){event(buffer.slice(0,end));buffer=buffer.slice(end+1)}
   if(done){event(buffer);break}
  }
  if(!result)throw new Error("La respuesta se interrumpió antes de terminar");
  return result;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}

export async function streamPiperReply(options:{
 messages:ChatMessage[];domain:Domain;locale:string;signal:AbortSignal;
 onText:(text:string)=>void;onResult:(reply:StreamReply)=>void;onClip:PiperClipHandler;
}){
 const queue=new PhraseQueue(),audio=new AbortController(),started=performance.now();
 let spoken=false,firstTextMs:number|undefined,firstPhraseMs:number|undefined,firstAudioMs:number|undefined,completeText="",lastUpdate=0;
 const cancel=()=>{queue.fail(new Error("Conversación cancelada"));audio.abort()};
 options.signal.addEventListener("abort",cancel,{once:true});
 if(options.signal.aborted)cancel();
 const splitter=new SpeechBuffer(phrase=>{firstPhraseMs??=performance.now()-started;queue.push(phrase)},options.locale);
 const playback=playPiperPhrases(queue,audio.signal,(player,url,phrase,part)=>{
  player.addEventListener("playing",()=>{spoken=true;firstAudioMs??=performance.now()-started},{once:true});
  options.onClip(player,url,phrase,part);
 }).then(()=>({error:undefined as unknown}),error=>{queue.close();return {error}});
 try{
  const result=await requestStreamedChat(options.messages,options.domain,options.signal,delta=>{
   firstTextMs??=performance.now()-started;completeText+=delta;splitter.add(delta);
   if(performance.now()-lastUpdate>80){options.onText(completeText);lastUpdate=performance.now()}
  });
  const chatDoneMs=performance.now()-started;
  splitter.finish();queue.close();options.onText(result.reply);options.onResult(result);
  const speech=await playback;
  console.info("[SUU conversation timing]",{
   firstTextMs:Math.round(firstTextMs??chatDoneMs),firstPhraseMs:firstPhraseMs===undefined?null:Math.round(firstPhraseMs),chatDoneMs:Math.round(chatDoneMs),
   firstAudioMs:firstAudioMs===undefined?null:Math.round(firstAudioMs),
   voiceInterrupted:Boolean(speech.error),provider:result.provider,
  });
  return {result,spoken,voiceError:speech.error};
 }catch(error){queue.fail(error);audio.abort();await playback;throw error}
 finally{options.signal.removeEventListener("abort",cancel);queue.close();audio.abort()}
}
