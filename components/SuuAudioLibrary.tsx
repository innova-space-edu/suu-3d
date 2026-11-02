"use client";
import {useEffect,useRef,useState} from 'react';
import {listLibraryClips,removeLibraryClip,cachedRecording,archiveLibraryClip,sharedLibraryInfo,importSharedClip,type LibraryClip} from '@/lib/audio-library';
import {fairAudioChunks,playFairAudio} from '@/lib/fair-audio';
import {requestPiperAudio} from '@/lib/piper-client';
import {FAIR_SCRIPTS} from '@/lib/fair-flow';
type Voice={id:string;label:string;locale:string;source:string};
type Props={ttsLocal:boolean;modePicker:React.ReactNode;onClose:()=>void};
export default function SuuAudioLibrary({ttsLocal,modePicker,onClose}:Props){
 const [items,setItems]=useState<LibraryClip[]>([]),[voices,setVoices]=useState<Voice[]>([]),[voice,setVoice]=useState('es-MX-DaliaNeural'),[group,setGroup]=useState('manual'),[text,setText]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('Biblioteca de audios generados en este navegador.'),[providers,setProviders]=useState<Record<string,unknown>>({}),[shared,setShared]=useState<{id:string;text:string}[]>([]),[server,setServer]=useState(false);
 const ctl=useRef<AbortController|null>(null),alive=useRef(true);
 const refresh=async()=>{const rows=await listLibraryClips();if(alive.current)setItems(rows)};
 useEffect(()=>{alive.current=true;void refresh();void fetch('/api/voice').then(r=>r.json()).then(j=>{if(alive.current){setVoices(j.voices||[]);setProviders(j.providers||{})}}).catch(()=>{});void sharedLibraryInfo().then(j=>{if(alive.current){setServer(j.configured!==false);setShared((j.items||[]) as {id:string;text:string}[])}}).catch(()=>{});return()=>{alive.current=false;ctl.current?.abort()}},[]);
 const run=async(action:(signal:AbortSignal)=>Promise<void>)=>{ctl.current?.abort();const c=new AbortController();ctl.current=c;setBusy(true);try{await action(c.signal)}catch(e){if(alive.current&&!c.signal.aborted)setMessage(e instanceof Error?e.message:'No se pudo completar')}finally{if(alive.current){setBusy(false);void refresh()}}};
 const generate=()=>run(async signal=>{
  const locale=voices.find(v=>v.id===voice)?.locale;const language=locale&&/^[a-z]{2}-[A-Z]{2}$/.test(locale)?locale:'es-CL';let persistent=true;const parts=fairAudioChunks(text);if(!parts.length)throw new Error('Escribe un texto');
  for(let i=0;i<parts.length;i++){
   signal.throwIfAborted();setMessage(`Generando y guardando ${i+1} de ${parts.length}…`);
   if(voice==='piper:daniela')await requestPiperAudio(parts[i],signal,group);
   else {const result=await cachedRecording(parts[i],voice,language,group,signal,async()=>{const r=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:parts[i],voiceId:voice,language,mode:group==='fair'?'fair':undefined}),signal:AbortSignal.any([signal,AbortSignal.timeout(55000)])});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||'No se pudo generar audio')}return {blob:await r.blob(),words:[]}});persistent=persistent&&result.persisted;}
  }
  setMessage(persistent?'Generación terminada. Cada fragmento está disponible en la biblioteca.':'Audio disponible solo durante esta sesión: el navegador no permitió guardarlo. Descárgalo para conservarlo.');
 });
 const download=(clip:LibraryClip)=>{const url=URL.createObjectURL(clip.blob),a=document.createElement('a');a.href=url;a.download=`suu-${clip.category}-${clip.id.slice(0,12)}.${clip.blob.type.includes('wav')?'wav':'mp3'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <div className="voiceOnlyOverlay audioLibraryOverlay" role="dialog" aria-modal="true" aria-label="Biblioteca de voces y audios"><header className="voiceHeader">{modePicker}<h2>Biblioteca de audios</h2><button onClick={onClose}>Cerrar</button></header><section className="audioLibraryBody">
  <p>Generación local: Piper Dell{providers.victus?' y Victus configurado':'; Victus pendiente de instalar/conectar'}. Online: Microsoft (las voces de EduAI), Gemini y proveedores configurados. Las cuotas gratuitas dependen de cada cuenta; OpenRouter no se presume gratuito.</p>
  <label>Voz / motor<select disabled={busy} value={voice} onChange={e=>setVoice(e.target.value)}>{ttsLocal&&<option value="piper:daniela">Piper · voz local Dell</option>}{voices.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
  <label>Carpeta<select disabled={busy} value={group} onChange={e=>setGroup(e.target.value)}><option value="manual">Creaciones</option><option value="fair">Feria</option><option value="conversation">Conversación</option></select></label>
  <label>Texto para narrar<textarea disabled={busy} value={text} maxLength={5000} rows={6} onChange={e=>setText(e.target.value)}/></label><button disabled={busy} onClick={()=>{setText(FAIR_SCRIPTS.welcome);setGroup('fair')}}>Cargar bienvenida de la feria</button><button disabled={busy||!text.trim()} onClick={()=>void generate()}>Generar y guardar</button>{busy&&<button onClick={()=>ctl.current?.abort()}>Detener</button>}
  <p role="status">{message}</p><p>Las respuestas de conversación se reutilizan solo con la misma pregunta y contexto, para no responder con información de otra conversación. El audio de una respuesta idéntica se reutiliza por texto, voz e idioma.</p>
  <label>Buscar en la biblioteca<input value={query} onChange={e=>setQuery(e.target.value)}/></label><button onClick={()=>void refresh()}>Actualizar lista</button>
  <p>Archivo Dell: {server?'habilitado; las copias son accesibles a quienes tienen acceso a SUU':'pendiente de actualizar el servidor y habilitarlo en Vercel'}. La copia local se conserva en este navegador.</p>
  {items.filter(c=>(c.text+' '+c.voice+' '+c.category).toLowerCase().includes(query.toLowerCase())).map(clip=><article key={clip.id}><strong>{clip.category} · {clip.voice}</strong><p>{clip.text}</p><button disabled={busy} onClick={()=>void run(async signal=>{await playFairAudio([{text:clip.text,blob:clip.blob}],signal,()=>{});setMessage('Reproducción terminada')})}>Reproducir</button><button onClick={()=>download(clip)}>Descargar</button><button disabled={busy} onClick={()=>void removeLibraryClip(clip.id).then(refresh).catch(()=>setMessage('No se pudo eliminar'))}>Eliminar copia local</button><button disabled={!server||busy} onClick={()=>void run(async()=>{await archiveLibraryClip(clip);setMessage('Copia guardada en la carpeta del Dell')})}>Copiar al Dell</button></article>)}
  {shared.length>0&&<details><summary>Audios archivados en Dell</summary>{shared.map(item=><p key={item.id}>{item.text.slice(0,120)} <button disabled={busy} onClick={()=>void run(async()=>{await importSharedClip(item.id);setMessage('Audio recuperado del Dell')})}>Recuperar copia</button></p>)}</details>}
 </section></div>;
}
