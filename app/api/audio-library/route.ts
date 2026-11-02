import {NextRequest,NextResponse} from 'next/server';
import {authorized,originAllowed,throttle,clientIdentity} from '@/lib/security';
export const runtime='nodejs';export const maxDuration=60;
function configured(){return process.env.SUU_AUDIO_LIBRARY_ENABLED==='true'&&process.env.SUU_TTS_API_BASE_URL&&process.env.SUU_TTS_API_TOKEN}
async function proxy(req:NextRequest,write=false){
 if(!originAllowed(req))return NextResponse.json({error:'Origen rechazado'},{status:403});
 if(!await authorized())return NextResponse.json({error:'Acceso requerido'},{status:401});
 if(!throttle('audio-library:'+clientIdentity(req),60))return NextResponse.json({error:'Límite temporal'},{status:429});
 if(!configured())return NextResponse.json({configured:false,items:[],error:write?'Actualiza Piper Dell y habilita SUU_AUDIO_LIBRARY_ENABLED':undefined},{status:write?503:200});
 const key=req.nextUrl.searchParams.get('id');if(key&&!/^[a-f0-9]{64}$/.test(key)||write&&!key)return NextResponse.json({error:'ID inválido'},{status:400});
 let body:string|undefined;
 if(write){const parts:Uint8Array[]=[];let n=0;const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:'Audio vacío'},{status:400});try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>4_100_000)return NextResponse.json({error:'Audio excesivo'},{status:413});parts.push(value)}body=Buffer.concat(parts).toString('utf8');JSON.parse(body)}catch{return NextResponse.json({error:'Audio inválido'},{status:400})}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}}
 try{
  const base=new URL(process.env.SUU_TTS_API_BASE_URL!);if(base.protocol!=='https:'||base.username||base.password)throw Error('Invalid endpoint');
  const res=await fetch(base.href.replace(/\/$/,'')+'/library'+(key?'/'+key:''),{method:write?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.SUU_TTS_API_TOKEN,'CF-Access-Client-Id':process.env.SUU_DELL_CF_ACCESS_CLIENT_ID||'','CF-Access-Client-Secret':process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET||''},body,signal:AbortSignal.any([req.signal,AbortSignal.timeout(12000)]),cache:'no-store',redirect:'error'});
  if(!res.ok)return NextResponse.json({configured:true,error:'Biblioteca Dell no disponible; conserva la copia local'},{status:res.status===404?404:503});
  if(!res.body)throw Error('Empty');const reader=res.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>4_100_000)throw Error('Excessive');chunks.push(item.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}const response=Buffer.concat(chunks);return new Response(response,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({configured:true,error:'No se pudo conectar con la biblioteca Dell'},{status:503})}
}
export const GET=(req:NextRequest)=>proxy(req);export const POST=(req:NextRequest)=>proxy(req,true);
