import {NextRequest,NextResponse} from "next/server";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
import {piperConfigured} from "@/lib/piper-config";

export const runtime="nodejs";
export const maxDuration=60;
const MAX_INPUT_CHARS=700, MAX_AUDIO_BYTES=3_000_000;

export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("piper:"+clientIdentity(req),15))return NextResponse.json({error:"Límite de voz"},{status:429});
 if(!piperConfigured())return NextResponse.json({error:"Piper Dell no está habilitado",reason:"missing_config"},{status:503});
 const declared=req.headers.get("content-length");
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>3500))
  return NextResponse.json({error:"Texto demasiado grande"},{status:413});
 if(req.headers.get("content-type")?.split(";",1)[0]!=="application/json")
  return NextResponse.json({error:"Solo JSON"},{status:415});
 let data:unknown;
 try{
  const body=await req.text();
  if(body.length>3500)return NextResponse.json({error:"Solicitud demasiado grande"},{status:413});
  data=JSON.parse(body);
 }catch{return NextResponse.json({error:"JSON inválido"},{status:400})}
 const text=typeof data==="object"&&data!==null&&"text" in data?(data as {text?:unknown}).text:undefined;
 if(typeof text!=="string"||text.trim().length<1||text.length>MAX_INPUT_CHARS)
  return NextResponse.json({error:"Texto de voz inválido"},{status:400});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),43000);
 try{
  const origin=process.env.SUU_TTS_API_BASE_URL!.replace(/\/+$/,"");
  const upstream=await fetch(origin+"/synthesize",{
   method:"POST",cache:"no-store",signal:controller.signal,
   headers:{
    "Content-Type":"application/json",
    Authorization:"Bearer "+process.env.SUU_TTS_API_TOKEN,
    "CF-Access-Client-Id":process.env.SUU_DELL_CF_ACCESS_CLIENT_ID!,
    "CF-Access-Client-Secret":process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET!,
   },
   body:JSON.stringify({text:text.trim()})
  });
  if(!upstream.ok){
   // No upstream response body or authentication headers are logged or returned.
   const reason=upstream.status===401||upstream.status===403?"access_denied"
    :upstream.status===404?"route_not_found"
    :upstream.status===429?"busy"
    :upstream.status>=500?"upstream_unavailable":"upstream_rejected";
   console.warn("[SUU Piper]",{reason,upstreamStatus:upstream.status});
   return NextResponse.json({error:"Voz del Dell no disponible",reason,upstreamStatus:upstream.status},{status:503});
  }
  if(!upstream.headers.get("content-type")?.toLowerCase().startsWith("audio/wav")){
   console.warn("[SUU Piper]",{reason:"not_wav",upstreamStatus:upstream.status});
   return NextResponse.json({error:"Respuesta de voz no es WAV",reason:"not_wav"},{status:503});
  }
  const audio=await upstream.arrayBuffer();
  if(audio.byteLength<100||audio.byteLength>MAX_AUDIO_BYTES){
   console.warn("[SUU Piper]",{reason:"invalid_audio_size",audioBytes:audio.byteLength});
   return NextResponse.json({error:"Tamaño de audio inválido",reason:"invalid_audio_size"},{status:503});
  }
  const bytes=new Uint8Array(audio);
  if(String.fromCharCode(...bytes.slice(0,4))!=="RIFF"){
   console.warn("[SUU Piper]",{reason:"invalid_wav"});
   return NextResponse.json({error:"WAV inválido",reason:"invalid_wav"},{status:503});
  }
  return new NextResponse(audio,{
   headers:{"Content-Type":"audio/wav","Cache-Control":"private, no-store",
    "X-Suu-Voice-Provider":"dell-piper"}
  });
 }catch(err){
  const reason=controller.signal.aborted?"upstream_timeout":"upstream_network";
  console.warn("[SUU Piper]",{reason});
  return NextResponse.json({error:"Piper no responde",reason},{status:503});
 }
 finally{clearTimeout(timer)}
}
