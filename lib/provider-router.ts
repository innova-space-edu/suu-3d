import type {ChatMessage} from "./providers";

type Id="groq"|"sambanova"|"openrouter"|"gemini"|"legacy";
type Config={id:Id;name:string;model:string;key:string;url:string};
type Status={id:Id;name:string;model:string;configured:boolean};
const endpoints={
 groq:"https://api.groq.com/openai/v1",
 sambanova:"https://api.sambanova.ai/v1",
 openrouter:"https://openrouter.ai/api/v1",
 gemini:"https://generativelanguage.googleapis.com/v1beta/openai"
};
export function providerConfigs():Config[]{
 const choose=(...values:(string|undefined)[])=>values.find(v=>v?.trim())?.trim()||"";
 const input=[
 {id:"groq" as const,name:"Groq",key:choose(process.env.GROQ_API_KEY,process.env.SUU_GROQ_API_KEY),model:choose(process.env.GROQ_MODEL,"llama-3.3-70b-versatile"),url:endpoints.groq},
 {id:"sambanova" as const,name:"SambaNova",key:choose(process.env.SAMBANOVA_API_KEY_SUU,process.env.SAMBANOVA_API_KEY),model:choose(process.env.SAMBANOVA_MODEL_SUU,"Meta-Llama-3.3-70B-Instruct"),url:endpoints.sambanova},
 {id:"openrouter" as const,name:"OpenRouter",key:choose(process.env.OPENROUTER_API_KEY_SUU,process.env.OPENROUTER_API_KEY),model:choose(process.env.OPENROUTER_MODEL_SUU,"meta-llama/llama-3.3-70b-instruct"),url:endpoints.openrouter},
 {id:"gemini" as const,name:"Gemini",key:choose(process.env.GEMINI_API_KEY_SUU,process.env.GEMINI_API_KEY),model:choose(process.env.GEMINI_MODEL_SUU,"gemini-2.5-flash"),url:endpoints.gemini}
 ];
 // Existing users of SUU may have saved their Groq key in the original generic variables.
 const oldKey=process.env.SUU_LLM_API_KEY?.trim();
 const oldModel=process.env.SUU_LLM_MODEL?.trim();
 const oldUrl=process.env.SUU_LLM_BASE_URL?.trim().replace(/\/+$/,"");
 const legacyMatch=input.find(p=>p.url===oldUrl);
 if(oldKey&&oldModel&&legacyMatch&&!legacyMatch.key){legacyMatch.key=oldKey;legacyMatch.model=oldModel}
 else if(oldKey&&oldModel&&oldUrl&&Object.values(endpoints).includes(oldUrl)&&!legacyMatch){input.push({id:"legacy" as never,name:"Anterior",key:oldKey,model:oldModel,url:oldUrl as typeof endpoints.groq})}
 return input.filter(p=>p.key&&p.model) as Config[];
}
export function providerStatus():Status[]{
 const active=providerConfigs();
 return [
 {id:"groq" as const,name:"Groq"},{id:"sambanova" as const,name:"SambaNova"},{id:"openrouter" as const,name:"OpenRouter"},{id:"gemini" as const,name:"Gemini"}
 ].map(p=>({...p,configured:active.some(c=>c.id===p.id),model:active.find(c=>c.id===p.id)?.model||""}));
}
export async function chatWithFallback(messages:ChatMessage[],system:string){
 const available=providerConfigs().slice(0,4);
 if(!available.length)throw new Error("No hay proveedor IA. Configura Groq o SUU_LLM_* en Vercel.");
 const failures:string[]=[];
 for(let i=0;i<available.length;i++){
  const p=available[i],ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),11000);
  try{
   const response=await fetch(p.url+"/chat/completions",{
    method:"POST",cache:"no-store",signal:ctl.signal,
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+p.key,...(p.id==="openrouter"?{"HTTP-Referer":"https://suu-3d.vercel.app","X-Title":"SUU 3D"}:{})},
    body:JSON.stringify({model:p.model,temperature:0.4,max_tokens:900,messages:[{role:"system",content:system},...messages]})
   });
   if(!response.ok){
    const status=response.status;
    const reason=status===401||status===403?"clave rechazada o sin permisos":status===429?"cuota o límite de solicitudes":status===400||status===404?"modelo o solicitud no admitidos":status>=500?"servicio temporalmente no disponible":"solicitud rechazada";
    failures.push(p.name+": "+reason+" (HTTP "+status+")");
    console.warn("[SUU failover]",p.id,status);
    continue;
   }
   const data=await response.json();
   const reply=data?.choices?.[0]?.message?.content;
   if(typeof reply!=="string"||!reply.trim())throw new Error("Empty response");
   return {reply:reply.slice(0,12000),provider:p.name,model:p.model,fallbackUsed:i>0};
  }catch(error){
   // An unavailable, rate-limited, unauthorized or exhausted provider cannot block the rest.
   const timeout=ctl.signal.aborted;
   failures.push(p.name+": "+(timeout?"tiempo de espera agotado":"fallo de red o respuesta inválida"));
   console.warn("[SUU failover]",p.id,timeout?"timeout":"network_or_response");
  }finally{clearTimeout(timer)}
 }
 throw new Error("No se pudo obtener respuesta. "+failures.join("; ")+". Revisa la configuración de IA en Vercel.");
}
