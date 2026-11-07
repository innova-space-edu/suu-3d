/** Persistent, bounded audio library. Only generated output, never microphone recordings. */
export type LibraryClip={id:string;text:string;voice:string;language:string;category:string;created:number;blob:Blob;words:unknown[];characters?:unknown[];phonemes?:unknown[]};
export type LibraryReply={id:string;reply:string;provider:string;created:number;parts?:string[]};
const DB='suu-audio-library-v1',MAX_BYTES=160_000_000,MAX_ITEMS=500;
let connection:Promise<IDBDatabase>|undefined;
const memory=new Map<string,LibraryClip>(),replies=new Map<string,LibraryReply>();
function open(){if(!globalThis.indexedDB)return Promise.reject(new Error('Almacenamiento no disponible'));return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('clips',{keyPath:'id'});r.result.createObjectStore('replies',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{connection=undefined;reject(new Error('No se pudo abrir la biblioteca'))};r.onblocked=()=>reject(new Error('Cierra otras pestañas de SUU y reintenta'))})}
async function read<T>(store:string,key?:string):Promise<T>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=key?tx.objectStore(store).get(key):tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result as T);r.onerror=()=>reject(new Error('No se pudo leer la biblioteca'))})}
async function write(store:string,value:unknown,remove?:string){const db=await open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');if(remove)tx.objectStore(store).delete(remove);else tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('No se pudo guardar la biblioteca'));tx.onabort=()=>reject(new Error('No se pudo guardar la biblioteca'))})}
export async function libraryHash(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('')}
export async function listLibraryClips():Promise<LibraryClip[]>{try{const saved=await read<LibraryClip[]>('clips');return [...new Map([...memory.values(),...saved].map(c=>[c.id,c])).values()].sort((a,b)=>b.created-a.created)}catch{return [...memory.values()].sort((a,b)=>b.created-a.created)}}
export async function removeLibraryClip(id:string){memory.delete(id);await write('clips',null,id)}
export async function saveLibraryClip(clip:LibraryClip){
 if(!/^[a-f0-9]{64}$/.test(clip.id)||clip.blob.size<100||clip.blob.size>3_000_000||!clip.blob.type.startsWith('audio/'))throw new Error('Audio no válido para la biblioteca');
 const all=(await listLibraryClips()).filter(c=>c.id!==clip.id);if(all.length>=MAX_ITEMS||all.reduce((n,c)=>n+c.blob.size,0)+clip.blob.size>MAX_BYTES)throw new Error('Biblioteca llena: descarga y elimina algunos audios');
 await write('clips',clip);memory.delete(clip.id);
}
export async function cachedRecording(text:string,voice:string,language:string,category:string,signal:AbortSignal,generate:()=>Promise<{blob:Blob;words:unknown[];characters?:unknown[];phonemes?:unknown[]}>){
 const id=await libraryHash(['audio-v1',text,voice,language]);signal.throwIfAborted();
 let existing:LibraryClip|undefined;try{existing=await read<LibraryClip>('clips',id)}catch{}
 existing??=memory.get(id);
 if(existing?.blob instanceof Blob&&existing.blob.size>=100){return {blob:existing.blob,words:existing.words,characters:existing.characters??[],phonemes:existing.phonemes??[],cached:true,persisted:!memory.has(id)}}
 const result=await generate();signal.throwIfAborted();const clip:LibraryClip={id,text,voice,language,category,created:Date.now(),blob:result.blob,words:result.words,characters:result.characters??[],phonemes:result.phonemes??[]};
 let persisted=true;try{await saveLibraryClip(clip)}catch{persisted=false;while(memory.size>=20)memory.delete(memory.keys().next().value!);memory.set(id,clip)}
 void sharedEnabled().then(enabled=>enabled?archiveLibraryClip(clip):undefined).catch(()=>{});
 return {...result,cached:false,persisted};
}
export async function responseLibraryKey(messages:readonly {role:string;content:string}[],domain:string,brief:boolean){return libraryHash(['reply-v1',domain,brief,messages])}
export async function findLibraryReply(id:string){try{return await read<LibraryReply>('replies',id)}catch{return replies.get(id)}}
export async function rememberLibraryReply(id:string,reply:string,provider:string,parts?:string[]){
 if(!reply.trim()||reply.length>12000)return;
 const item={id,reply,provider,created:Date.now(),parts};try{const all=await read<LibraryReply[]>('replies');if(all.length>=500)await write('replies',null,all.sort((a,b)=>a.created-b.created)[0].id);await write('replies',item)}catch{if(replies.size>=100)replies.delete(replies.keys().next().value!);replies.set(id,item)}
}

export async function clearLibraryVoice(voice:string){for(const clip of await listLibraryClips())if(clip.voice===voice)await removeLibraryClip(clip.id)}
export async function archiveLibraryClip(clip:LibraryClip){
 const bytes=new Uint8Array(await clip.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const res=await fetch('/api/audio-library?id='+clip.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:clip.text,voice:clip.voice,language:clip.language,category:clip.category,mime:clip.blob.type,audio:btoa(binary)})});
 if(!res.ok)throw new Error('No se pudo archivar en Dell. Revisa que Piper esté actualizado y la biblioteca habilitada.');
}
export async function sharedLibraryInfo(){const res=await fetch('/api/audio-library',{cache:'no-store'});if(!res.ok)throw new Error('Biblioteca Dell no disponible');return res.json() as Promise<{configured?:boolean;items?:Omit<LibraryClip,'blob'|'words'>[]}>}
export async function importSharedClip(id:string){const res=await fetch('/api/audio-library?id='+id,{cache:'no-store'});if(!res.ok)throw new Error('Audio Dell no disponible');const data=await res.json();if(typeof data.audio!=='string'||data.audio.length>4_000_000)throw new Error('Audio inválido');const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));const clip:LibraryClip={id,text:String(data.text||''),voice:String(data.voice||''),language:String(data.language||''),category:String(data.category||''),created:Date.now(),blob:new Blob([bytes],{type:data.mime}),words:[]};await saveLibraryClip(clip);return clip}

let sharedCheck:Promise<boolean>|undefined;
function sharedEnabled(){return sharedCheck??=sharedLibraryInfo().then(info=>info.configured===true).catch(()=>false)}
