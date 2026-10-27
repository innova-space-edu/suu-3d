import {NextRequest,NextResponse} from "next/server";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
import {parseConversation,chat} from "@/lib/providers";
import {fairAudienceText} from "@/lib/speech-text";
import {bridgeAvailable,queryBridge} from "@/lib/bridges";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("chat:"+clientIdentity(req),25))return NextResponse.json({error:"Límite temporal"},{status:429});
 if(Number(req.headers.get("content-length")||0)>95000)return NextResponse.json({error:"Solicitud excesiva"},{status:413});
 try{
  const body=await req.text();
  if(body.length>95000)return NextResponse.json({error:"Solicitud excesiva"},{status:413});
  const input=JSON.parse(body);
  const {messages,domain,mode}=parseConversation(input);
  let context="",bridgeWarning="";
  let sources:{title:string;url:string}[]=[];
  if(mode!=="fair"&&domain!=="general"&&bridgeAvailable(domain)){
   try{
    const r=await queryBridge(domain,"ask",messages.at(-1)?.content||"");
    context=typeof r.message==="string"?r.message:"";
    sources=Array.isArray(r.sources)?r.sources.filter(x=>x&&typeof x.url==="string"&&x.url.startsWith("https://")).slice(0,5):[];
   }catch{bridgeWarning="No se pudo consultar el servicio; respuesta sin ese contexto"}
  }
  if(input.stream===true&&mode!=="fair"){
   const ctl=new AbortController(),encoder=new TextEncoder();
   const cancel=()=>ctl.abort();
   req.signal.addEventListener("abort",cancel,{once:true});
   if(req.signal.aborted)cancel();
   const response=new ReadableStream<Uint8Array>({
    async start(stream){
     const emit=(event:unknown)=>{if(!ctl.signal.aborted)stream.enqueue(encoder.encode(JSON.stringify(event)+"\n"))};
     try{
      const result=await chat(messages,domain,context,mode,{signal:ctl.signal,onDelta:text=>emit({type:"delta",text})});
      emit({type:"done",...result,sources,bridgeWarning});
      if("timing" in result)console.info("[SUU chat timing]",{provider:result.provider,...result.timing});
     }catch(e){
      if(!ctl.signal.aborted)emit({type:"error",error:e instanceof Error?e.message:"No se pudo responder"});
     }finally{
      req.signal.removeEventListener("abort",cancel);
      if(!ctl.signal.aborted)stream.close();
     }
    },
    cancel(){ctl.abort();req.signal.removeEventListener("abort",cancel)},
   });
   return new Response(response,{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store, no-transform","X-Accel-Buffering":"no"}});
  }
  const result=await chat(messages,domain,context,mode,{signal:req.signal});
  return NextResponse.json({...result,reply:mode==="fair"?fairAudienceText(result.reply):result.reply,sources,bridgeWarning},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"No se pudo responder"},{status:502})}
}
