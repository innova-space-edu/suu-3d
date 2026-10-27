import {NextRequest,NextResponse} from "next/server";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
export const runtime="nodejs";
export const maxDuration=60;
const MAX_BYTES=2_500_000;
const FORMATS=new Set(["audio/webm","audio/ogg","audio/mp4","audio/wav","audio/x-wav","audio/mpeg"]);
const LANGUAGES=new Set(["es","en","pt","fr"]);

export function sttConfigured(){
 const raw=process.env.SUU_STT_API_BASE_URL||"";
 const token=process.env.SUU_STT_API_TOKEN||"";
 const cfId=process.env.SUU_DELL_CF_ACCESS_CLIENT_ID||"";
 const cfSecret=process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET||"";
 try{
  const url=new URL(raw);
  return url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash
   &&!url.pathname.replace(/\\/g,"/").includes("..")&&token.length>=32&&Boolean(cfId&&cfSecret);
 }catch{return false}
}
export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("stt:"+clientIdentity(req),12))return NextResponse.json({error:"Límite de transcripción"},{status:429});
 if(!sttConfigured())return NextResponse.json({error:"STT Dell aún no está habilitado"},{status:503});
 const declared=req.headers.get("content-length");
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))return NextResponse.json({error:"Audio demasiado grande"},{status:413});
 const type=(req.headers.get("content-type")||"").split(";",1)[0].toLowerCase();
 if(!FORMATS.has(type))return NextResponse.json({error:"Formato no admitido"},{status:415});
 const lang=(req.headers.get("x-suu-language")||"es").split("-",1)[0].toLowerCase();
 if(!LANGUAGES.has(lang))return NextResponse.json({error:"Idioma no admitido"},{status:400});
 const bytes=await req.arrayBuffer();
 if(bytes.byteLength<300||bytes.byteLength>MAX_BYTES)return NextResponse.json({error:"Audio inválido"},{status:413});
 const origin=process.env.SUU_STT_API_BASE_URL!.replace(/\/+$/,"");
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),28000);
 try{
  const upstream=await fetch(origin+"/transcribe",{
   method:"POST",signal:ctl.signal,cache:"no-store",
   headers:{"Content-Type":type,"X-Suu-Language":lang,
    Authorization:"Bearer "+process.env.SUU_STT_API_TOKEN,
    "CF-Access-Client-Id":process.env.SUU_DELL_CF_ACCESS_CLIENT_ID!,
    "CF-Access-Client-Secret":process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET!},
   body:bytes
  });
  if(!upstream.ok)return NextResponse.json({error:"STT local no disponible",code:upstream.status},{status:503});
  const data=await upstream.json();
  if(typeof data.text!=="string"||data.text.length>3000)throw new Error("Respuesta STT inválida");
  return NextResponse.json({text:data.text,provider:"Dell STT",language:lang},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Tiempo agotado o STT inaccesible"},{status:503})}
 finally{clearTimeout(timer)}
}
