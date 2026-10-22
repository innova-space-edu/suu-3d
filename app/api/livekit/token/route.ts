import {NextRequest,NextResponse} from "next/server";
import {AccessToken,RoomServiceClient} from "livekit-server-sdk";
import {authorized,originAllowed,throttle,clientIdentity} from "@/lib/security";
import {randomUUID} from "node:crypto";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 if(!originAllowed(req))return NextResponse.json({error:"Origen rechazado"},{status:403});
 if(!await authorized())return NextResponse.json({error:"Acceso requerido"},{status:401});
 if(!throttle("livekit:"+clientIdentity(req),8))return NextResponse.json({error:"Límite temporal"},{status:429});
 const url=process.env.SUU_LIVEKIT_URL?.trim(),key=process.env.LIVEKIT_API_KEY?.trim(),secret=process.env.LIVEKIT_API_SECRET?.trim();
 if(!url||!key||!secret)return NextResponse.json({error:"LiveKit no configurado"},{status:409});
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=="wss:"||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error();
 }catch{return NextResponse.json({error:"SUU_LIVEKIT_URL debe ser la URL wss:// del proyecto LiveKit."},{status:503})}
 try{
  // Read-only credential check before offering a participant token. Never return room metadata.
  const service=new RoomServiceClient(url.replace(/^wss:/,"https:"),key,secret,{requestTimeout:8});
  await service.listRooms(["suu-credential-check-"+randomUUID()]);
  const room="suu-"+randomUUID();
  const token=new AccessToken(key,secret,{identity:"visitor-"+randomUUID(),ttl:"10m"});
  token.addGrant({roomJoin:true,room,canPublish:true,canSubscribe:true,canPublishData:true,roomCreate:false,roomAdmin:false});
  return NextResponse.json({url,token:await token.toJwt(),room},{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  const status=e&&typeof e==="object"&&"status" in e?Number(e.status):0;
  console.warn("[SUU LiveKit] credential check failed",status||"network");
  return NextResponse.json({error:status===401||status===403?"LiveKit rechazó las credenciales. SUU_LIVEKIT_URL, LIVEKIT_API_KEY y LIVEKIT_API_SECRET deben pertenecer al mismo proyecto. Revisa esas variables en Vercel.":"No se pudo verificar LiveKit. Revisa la URL del proyecto y su disponibilidad. La conversación del botón de audífonos funciona por separado."},{status:503});
 }
}
