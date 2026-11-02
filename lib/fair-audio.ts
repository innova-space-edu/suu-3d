/** Only the fixed public fair narration is stored, never visitor speech. */
export type FairClip={text:string;blob:Blob};
const CACHE="suu-fair-welcome-audio-v1";
const MAX_TOTAL=48_000_000;
export function fairAudioChunks(text:string):string[]{
 const chunks:string[]=[];let rest=text.trim();
 while(rest){
  if(rest.length<=600){chunks.push(rest);break}
  const front=rest.slice(0,601);let cut=0;
  for(const m of front.matchAll(/[.!?](?=\s)/g))if(m.index>=200)cut=m.index+1;
  if(!cut)cut=front.lastIndexOf(" ");if(cut<1)cut=600;
  chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trimStart();
 }
 return chunks;
}
export async function clearFairAudio(storage:CacheStorage|undefined=globalThis.caches){await storage?.delete(CACHE)}
export async function prepareFairAudio(text:string,voice:string,signal:AbortSignal,synthesize:(text:string,signal:AbortSignal)=>Promise<Blob>,progress:(done:number,total:number)=>void,storage:CacheStorage|undefined=globalThis.caches):Promise<{clips:FairClip[];persisted:boolean}>{
 const parts=fairAudioChunks(text);if(!parts.length)throw new Error("La bienvenida está vacía");
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([voice,text])))),b=>b.toString(16).padStart(2,"0")).join("");
 let cache:Cache|undefined,persisted=true;
 try{cache=await storage?.open(CACHE);if(!cache)persisted=false}catch{persisted=false}
 const clips:FairClip[]=[];let total=0;
 for(let i=0;i<parts.length;i++){
  signal.throwIfAborted();
  const key=`https://suu-fair-cache.invalid/${hash}/${i}`;
  let blob:Blob|undefined;
  try{const hit=await cache?.match(key);if(hit)blob=await hit.blob()}catch{persisted=false}
  if(blob&&(!blob.type.startsWith("audio/")||blob.size<100||blob.size>3_000_000))blob=undefined;
  if(!blob){
   blob=await synthesize(parts[i],signal);signal.throwIfAborted();
   if(!blob.type.startsWith("audio/")||blob.size<100||blob.size>3_000_000)throw new Error("Fragmento de bienvenida inválido");
   try{if(cache)await cache.put(key,new Response(blob,{headers:{"Content-Type":blob.type}}))}catch{persisted=false}
  }
  total+=blob.size;if(total>MAX_TOTAL)throw new Error("La grabación supera el límite de almacenamiento");
  clips.push({text:parts[i],blob});progress(i+1,parts.length);
 }
 signal.throwIfAborted();
 // Keep a single voice/script recording; partial generation remains resumable.
 try{if(cache)for(const key of await cache.keys())if(!key.url.startsWith(`https://suu-fair-cache.invalid/${hash}/`))await cache.delete(key)}catch{persisted=false}
 return {clips,persisted};
}
export async function playFairAudio(clips:readonly FairClip[],signal:AbortSignal,onClip:(player:HTMLAudioElement,text:string)=>void){
 for(const clip of clips){
  signal.throwIfAborted();const url=URL.createObjectURL(clip.blob),player=new Audio(url);
  try{
   onClip(player,clip.text);
   await new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{player.onended=null;player.onerror=null;signal.removeEventListener("abort",cancel)};
    const cancel=()=>{cleanup();player.pause();reject(new DOMException("Cancelado","AbortError"))};
    player.onended=()=>{cleanup();resolve()};player.onerror=()=>{cleanup();reject(new Error("No se pudo reproducir la bienvenida"))};
    signal.addEventListener("abort",cancel,{once:true});if(signal.aborted){cancel();return}
    player.play().catch(e=>{cleanup();reject(e)});
   });
  }finally{player.pause();player.src="";URL.revokeObjectURL(url)}
 }
}
