import {NextRequest,NextResponse} from "next/server";
import {extraTTS,extraVoiceCatalog,ttsProviderStatus} from "@/lib/extra-tts";
import {EdgeTTS,Constants} from "@andresaya/edge-tts";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
import {DEFAULT_VOICE_ID,knownVoice,voiceCatalog} from "@/lib/voice-catalog";
import {spokenText,fairSpokenText} from "@/lib/speech-text";
import {wordTimings} from "@/lib/lip-sync";
import {alignSpeechPhones} from "@/lib/phoneme-aligner";
export const runtime="nodejs";export const maxDuration=60;
export async function GET(){
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 return NextResponse.json({voices:voiceCatalog(),providers:ttsProviderStatus(),defaultVoice:DEFAULT_VOICE_ID,privateEduaiVoices:"Requieren sesión EDUAI, MFA y autorización individual"},{headers:{"Cache-Control":"private, no-store"}});
}
async function synthesizeEdge(text:string,id:string){
 const tts=new EdgeTTS();
 await tts.synthesize(text,id,{outputFormat:Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,rate:"-2%",pitch:"+0Hz",volume:"100%"});
 const audio=tts.toBuffer();
 if(audio.length<200||audio.length>8000000)throw new Error("Respuesta de audio inválida");
 return {audio:new Uint8Array(audio),words:wordTimings(tts.getWordBoundaries()),characters:[] as {text:string;start:number;end:number}[]};
}
async function synthesizePremium(text:string,withTimings:boolean){
 const key=process.env.ELEVENLABS_API_KEY,voice=process.env.ELEVENLABS_VOICE_ID;
 if(!key||!voice)throw new Error("ElevenLabs no está configurado");
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),19000);
 try{
  const endpoint="https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice)+(withTimings?"/with-timestamps":"");
  const res=await fetch(endpoint,{method:"POST",signal:ctl.signal,cache:"no-store",headers:{"xi-api-key":key,"Content-Type":"application/json","Accept":withTimings?"application/json":"audio/mpeg"},body:JSON.stringify({text,model_id:"eleven_multilingual_v2"})});
  if(!res.ok)throw new Error("ElevenLabs HTTP "+res.status);
  if(!withTimings){
   const audio=new Uint8Array(await res.arrayBuffer());
   if(audio.length<200||audio.length>8000000)throw new Error("Audio inválido");
   return {audio,words:[],characters:[] as {text:string;start:number;end:number}[]};
  }
  const data=await res.json(),base64=String(data.audio_base64||"");
  if(!base64||base64.length>11000000||!/^[A-Za-z0-9+/=]+$/.test(base64))throw new Error("Audio con tiempos inválido");
  const audio=new Uint8Array(Buffer.from(base64,"base64"));
  if(audio.length<200||audio.length>8000000)throw new Error("Audio inválido");
  const alignment=data.alignment||data.normalized_alignment;
  const characters:{text:string;start:number;end:number}[]=[];
  if(alignment&&Array.isArray(alignment.characters)&&Array.isArray(alignment.character_start_times_seconds)&&Array.isArray(alignment.character_end_times_seconds)){
   for(let i=0;i<Math.min(2400,alignment.characters.length);i++){
    const letter=alignment.characters[i],start=alignment.character_start_times_seconds[i],end=alignment.character_end_times_seconds[i];
    if(typeof letter==="string"&&letter.length<=3&&Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<180)characters.push({text:letter,start,end});
   }
  }
  return {audio,words:[],characters};
 }finally{clearTimeout(timer)}
}
export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("voice:"+clientIdentity(req),20))return NextResponse.json({error:"Demasiadas solicitudes"},{status:429});
 if(Number(req.headers.get("content-length")||0)>5000)return NextResponse.json({error:"Texto demasiado largo"},{status:413});
 let text="",voiceId=DEFAULT_VOICE_ID,timings=false,fairMode=false,language="es-CL";
 try{const b=await req.json();timings=b.timings===true;fairMode=b.mode==="fair";language=typeof b.language==="string"&&/^[a-z]{2}(?:-[a-z]{2,4})?$/i.test(b.language)?b.language:"es-CL";text=typeof b.text==="string"?b.text.trim():"";voiceId=typeof b.voiceId==="string"?b.voiceId:DEFAULT_VOICE_ID}catch{}
 if(!text||text.length>2000)return NextResponse.json({error:"Texto inválido"},{status:400});
 if(!knownVoice(voiceId)&&voiceId!=="elevenlabs:default")return NextResponse.json({error:"Voz no permitida"},{status:400});
 text=(fairMode?fairSpokenText:spokenText)(text,knownVoice(voiceId)?.locale||language);
 if(extraVoiceCatalog().some(v=>v.id===voiceId)){
  try{const result=await extraTTS(text,voiceId,language,req.signal);if(result.audio.length<100||result.audio.length>3_000_000)throw new Error("Audio inválido");
   if(timings)return NextResponse.json({audio:result.audio.toString("base64"),words:[],characters:[],mime:result.type,provider:result.provider},{headers:{"Cache-Control":"private, no-store"}});
   return new Response(new Uint8Array(result.audio),{headers:{"Content-Type":result.type,"Cache-Control":"private, no-store","X-Suu-Voice-Provider":result.provider}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Voz no disponible"},{status:503})}
 }
 if(!text)return NextResponse.json({error:"El texto no contiene contenido para leer"},{status:400});
 const pipeline=voiceId==="elevenlabs:default"?["premium","edge"] as const:["edge","premium"] as const;
 for(const provider of pipeline){
  try{
   if(provider==="premium"&&!(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID))continue;
   const result=provider==="edge"?await synthesizeEdge(text,knownVoice(voiceId)?voiceId:DEFAULT_VOICE_ID):await synthesizePremium(text,timings);
   if(timings){
    const phonemes=await alignSpeechPhones(result.audio,text,knownVoice(voiceId)?.locale||language);
    return NextResponse.json({audio:Buffer.from(result.audio).toString("base64"),words:result.words,characters:result.characters,phonemes,provider,sync:phonemes.length?"acoustically-aligned-phonemes":result.characters.length?"character-timed-visemes":result.words.length?"word-timed-letter-estimate":"estimated"},{headers:{"Cache-Control":"private, no-store"}});
   }
   return new NextResponse(Buffer.from(result.audio),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store","X-Suu-Voice-Provider":provider,"X-Suu-Voice-Id":provider==="edge"?(knownVoice(voiceId)?voiceId:DEFAULT_VOICE_ID):"elevenlabs:default"}});
  }catch(e){console.warn("[SUU voice fallback]",provider,e instanceof Error?e.name:"error")}
 }
 return NextResponse.json({error:"No hay motor de voz en línea. Usa las voces del navegador."},{status:503});
}
