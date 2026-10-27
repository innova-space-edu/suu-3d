/** Request private Dell Piper WAV; diagnostics contain no credentials or speech text. */
const errors:Record<string,string>={
 missing_config:"Falta configuración del motor en Vercel",
 access_denied:"Acceso rechazado (Cloudflare Access o clave Piper)",
 route_not_found:"Ruta Cloudflare no encontrada",
 busy:"Piper está ocupado",
 upstream_unavailable:"Túnel Cloudflare o servicio Piper no disponible",
 upstream_rejected:"El servidor Piper rechazó la solicitud",
 not_wav:"La ruta devolvió una página en lugar de audio WAV",
 invalid_audio_size:"Piper generó un audio demasiado grande o vacío",
 invalid_wav:"La respuesta de Piper no es WAV válido",
 upstream_timeout:"Tiempo de síntesis agotado en el Dell",
 upstream_network:"No se pudo conectar con el túnel del Dell",
};
export async function requestPiperAudio(text:string,signal:AbortSignal):Promise<Blob>{
 let response:Response;
 try{
  response=await fetch("/api/piper",{
   method:"POST",cache:"no-store",signal,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({text:text.slice(0,700)})
  });
 }catch(err){
  if(signal.aborted)throw new Error("Piper superó el tiempo de espera");
  throw new Error("No se pudo acceder a la API de voz de SUU");
 }
 if(!response.ok){
  let info:{reason?:string;upstreamStatus?:number}={};
  try{info=await response.json()}catch{}
  const message=info.reason&&Object.prototype.hasOwnProperty.call(errors,info.reason)
   ?errors[info.reason]:"Error al solicitar la voz Piper";
  const details=info.upstreamStatus?` · HTTP ${info.upstreamStatus}`:` · HTTP ${response.status}`;
  throw new Error(message+details);
 }
 if(!response.headers.get("content-type")?.startsWith("audio/wav"))
  throw new Error("La API respondió sin audio WAV");
 const blob=await response.blob();
 if(blob.size<100||blob.size>3_000_000)throw new Error("Tamaño WAV inválido");
 return blob;
}
