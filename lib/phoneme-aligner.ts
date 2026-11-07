import type {SpeechPhone} from "./lip-sync";

/** Optional server-to-server forced aligner. Disabled unless the administrator
 * configures a private URL and bearer secret. No visitor microphone audio is sent.
 * Network/model failures never prevent the speech response.
 */
export async function alignSpeechPhones(audio:Uint8Array,text:string,language:string):Promise<SpeechPhone[]>{
 const endpoint=process.env.SUU_PHONEME_ALIGNER_URL,secret=process.env.SUU_PHONEME_ALIGNER_TOKEN;
 if(!endpoint||!secret||audio.length<200||audio.length>8000000||!text||text.length>2000)return [];
 let url:URL;
 try{url=new URL(endpoint)}catch{return []}
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","suu-phoneme-aligner"].includes(url.hostname)))return [];
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),14000);
 try{
  const response=await fetch(url.toString(),{method:"POST",cache:"no-store",signal:ctl.signal,headers:{"Content-Type":"application/json","Authorization":"Bearer "+secret},body:JSON.stringify({audio:Buffer.from(audio).toString("base64"),mime:"audio/mpeg",text,language})});
  if(!response.ok)return [];
  const result=await response.json();
  if(!Array.isArray(result.phonemes))return [];
  return result.phonemes.filter((p:SpeechPhone)=>p&&typeof p.phone==="string"&&p.phone.length<=16&&Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.start>=0&&p.end>p.start&&p.end<180).slice(0,2400).sort((a:SpeechPhone,b:SpeechPhone)=>a.start-b.start);
 }catch{return []}
 finally{clearTimeout(timeout)}
}
