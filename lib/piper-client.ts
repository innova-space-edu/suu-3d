/** Request server-side Piper WAV; never expose Dell or Cloudflare credentials. */
export async function requestPiperAudio(text:string,signal:AbortSignal):Promise<Blob>{
 const response=await fetch("/api/piper",{
  method:"POST",cache:"no-store",signal,
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({text:text.slice(0,700)})
 });
 if(!response.ok)throw new Error("Piper Dell no disponible");
 if(!response.headers.get("content-type")?.startsWith("audio/wav"))
  throw new Error("Respuesta Piper inválida");
 const blob=await response.blob();
 if(blob.size<100||blob.size>3_000_000)throw new Error("WAV Piper inválido");
 return blob;
}
