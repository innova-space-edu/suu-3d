import {NextRequest,NextResponse} from "next/server";
import {EdgeTTS,Constants} from "@andresaya/edge-tts";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
import {DEFAULT_VOICE_ID,knownVoice,voiceCatalog} from "@/lib/voice-catalog";
import {spokenText} from "@/lib/speech-text";
import {wordTimings} from "@/lib/lip-sync";
export const runtime="nodejs";export const maxDuration=60;
export async function GET(){
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 return NextResponse.json({voices:voiceCatalog(),defaultVoice:DEFAULT_VOICE_ID,privateEduaiVoices:"Requieren sesión EDUAI, MFA y autorización individual"},{headers:{"Cache-Control":"private, no-store"}});
}
async function synthesizeEdge(text:string,id:string){
 const tts=new EdgeTTS();
 await tts.synthesize(text,id,{outputFormat:Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,rate:"-2%",pitch:"+0Hz",volume:"100%"});
 const audio=tts.toBuffer();
 if(audio.length<200||audio.length>8000000)throw new Error("Respuesta de audio inválida");
 return {audio:new Uint8Array(audio),words:wordTimings(tts.getWordBoundaries())};
}
async function synthesizePremium(text:string){
 const key=process.env.ELEVENLABS_API_KEY,voice=process.env.ELEVENLABS_VOICE_ID;
 if(!key||!voice)throw new Error("ElevenLabs no está configurado");
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),19000);
 try{
  const res=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice),{method:"POST",signal:ctl.signal,cache:"no-store",headers:{"xi-api-key":key,"Content-Type":"application/json","Accept":"audio/mpeg"},body:JSON.stringify({text,model_id:"eleven_multilingual_v2"})});
  if(!res.ok)throw new Error("ElevenLabs HTTP "+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.length<200||bytes.length>8000000)throw new Error("Audio inválido");
  return {audio:bytes,words:[]};
 }finally{clearTimeout(timer)}
}
export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("voice:"+clientIdentity(req),20))return NextResponse.json({error:"Demasiadas solicitudes"},{status:429});
 if(Number(req.headers.get("content-length")||0)>5000)return NextResponse.json({error:"Texto demasiado largo"},{status:413});
 let text="",voiceId=DEFAULT_VOICE_ID,timings=false;
 try{const b=await req.json();timings=b.timings===true;text=typeof b.text==="string"?b.text.trim():"";voiceId=typeof b.voiceId==="string"?b.voiceId:DEFAULT_VOICE_ID}catch{}
 if(!text||text.length>2000)return NextResponse.json({error:"Texto inválido"},{status:400});
 if(!knownVoice(voiceId)&&voiceId!=="elevenlabs:default")return NextResponse.json({error:"Voz no permitida"},{status:400});
 text=spokenText(text);
 if(!text)return NextResponse.json({error:"El texto no contiene contenido para leer"},{status:400});
 const pipeline=voiceId==="elevenlabs:default"?["premium","edge"] as const:["edge","premium"] as const;
 for(const provider of pipeline){
  try{
   if(provider==="premium"&&!(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID))continue;
   const result=provider==="edge"?await synthesizeEdge(text,knownVoice(voiceId)?voiceId:DEFAULT_VOICE_ID):await synthesizePremium(text);
   if(timings)return NextResponse.json({audio:Buffer.from(result.audio).toString("base64"),words:result.words,provider,sync:result.words.length?"word-timed-letter-estimate":"estimated"},{headers:{"Cache-Control":"private, no-store"}});
   return new NextResponse(Buffer.from(result.audio),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store","X-Suu-Voice-Provider":provider,"X-Suu-Voice-Id":provider==="edge"?(knownVoice(voiceId)?voiceId:DEFAULT_VOICE_ID):"elevenlabs:default"}});
  }catch(e){console.warn("[SUU voice fallback]",provider,e instanceof Error?e.name:"error")}
 }
 return NextResponse.json({error:"No hay motor de voz en línea. Usa las voces del navegador."},{status:503});
}
