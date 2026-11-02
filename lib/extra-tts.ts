/** Server-only TTS adapters. Credentials never appear in the voice catalog. */
export function extraVoiceCatalog(){
 return [
  ...((process.env.AZURE_SPEECH_KEY&&process.env.AZURE_SPEECH_REGION)?['es-MX-DaliaNeural','es-ES-ElviraNeural','es-CL-CatalinaNeural'].map(id=>({id:'azure:'+id,label:'Microsoft Azure · '+id.split('-')[2].replace('Neural',''),locale:id.slice(0,5),source:'azure',gender:'female'})):[]),
  ...((process.env.GEMINI_TTS_API_KEY||process.env.GEMINI_API_KEY_SUU)?['Kore','Aoede'].map(name=>({id:`gemini:${name}`,label:`Gemini · ${name} · cuota según cuenta`,locale:'multi',source:'gemini',gender:'female'})):[]),
  ...(process.env.GROQ_API_KEY?[{id:'groq:austin',label:'Groq · Austin · solo inglés',locale:'en-US',source:'groq',gender:'male'}]:[]),
  ...((process.env.OPENROUTER_API_KEY_SUU&&process.env.SUU_OPENROUTER_TTS_MODEL)?[{id:'openrouter:configured',label:'OpenRouter · voz configurada · tarifa del modelo',locale:'multi',source:'openrouter'}]:[]),
  ...((process.env.SUU_VICTUS_TTS_API_BASE_URL&&process.env.SUU_VICTUS_TTS_API_TOKEN)?[{id:'victus:local',label:'Victus · voz local configurada',locale:'es',source:'victus',gender:'female'}]:[]),
 ];
}
export function ttsProviderStatus(){return {microsoftEdge:true,azure:Boolean(process.env.AZURE_SPEECH_KEY&&process.env.AZURE_SPEECH_REGION),gemini:Boolean(process.env.GEMINI_TTS_API_KEY||process.env.GEMINI_API_KEY_SUU),groq:Boolean(process.env.GROQ_API_KEY),openrouter:Boolean(process.env.OPENROUTER_API_KEY_SUU&&process.env.SUU_OPENROUTER_TTS_MODEL),victus:Boolean(process.env.SUU_VICTUS_TTS_API_BASE_URL&&process.env.SUU_VICTUS_TTS_API_TOKEN),sambanova:{text:Boolean(process.env.SAMBANOVA_API_KEY_SUU),tts:false},sharedLibrary:process.env.SUU_AUDIO_LIBRARY_ENABLED==='true'};}
export function pcmWav(pcm:Uint8Array,rate=24000){
 if(!pcm.length||pcm.length%2||pcm.length>3_000_000)throw new Error('PCM inválido');
 const out=Buffer.alloc(44+pcm.length);out.write('RIFF');out.writeUInt32LE(36+pcm.length,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(pcm.length,40);out.set(pcm,44);return out;
}
async function bounded(res:Response,max:number){
 if(!res.ok)throw new Error(`Proveedor de voz rechazó la solicitud (HTTP ${res.status}); revisa modelo, clave y cuota`);
 if(!res.body)throw new Error('Audio vacío');const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Audio excesivo');chunks.push(value)}return Buffer.concat(chunks)}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export async function extraTTS(text:string,id:string,language:string,signal:AbortSignal){
 if(!extraVoiceCatalog().some(v=>v.id===id))throw new Error('Motor de voz sin configurar');
 const headers:Record<string,string>={'Content-Type':'application/json'};let url='',body:unknown,type='audio/wav';
 if(id.startsWith('gemini:')){
  const model=process.env.SUU_GEMINI_TTS_MODEL||'gemini-2.5-flash-preview-tts';if(!/^gemini-[a-zA-Z0-9.-]+$/.test(model))throw new Error('Modelo Gemini inválido');
  url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;headers['x-goog-api-key']=process.env.GEMINI_TTS_API_KEY||process.env.GEMINI_API_KEY_SUU!;
  body=model.startsWith('gemini-3.8')?{contents:[{role:'user',parts:[{text,speech_metadata:{style:`Natural clear speech in ${language}`}}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{voice:id.split(':')[1]}}}}:{contents:[{parts:[{text:`Read the following text verbatim in ${language}, without adding words:\n${text}`}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:id.split(':')[1]}}}}};
 }else if(id.startsWith('azure:')){
  const region=process.env.AZURE_SPEECH_REGION!;if(!/^[a-z0-9]{3,30}$/.test(region))throw new Error('Región Azure inválida');
  url=`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;headers['Content-Type']='application/ssml+xml';headers['Ocp-Apim-Subscription-Key']=process.env.AZURE_SPEECH_KEY!;headers['X-Microsoft-OutputFormat']='audio-24khz-96kbitrate-mono-mp3';
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
  body=`<speak version="1.0" xml:lang="${id.slice(6,11)}"><voice name="${id.slice(6)}">${escape(text)}</voice></speak>`;type='audio/mpeg';
 }else if(id.startsWith('groq:')){
  if(!language.startsWith('en'))throw new Error('La voz Groq configurada solo admite inglés. Para español elige Gemini, Piper o EDUAI.');
  url='https://api.groq.com/openai/v1/audio/speech';headers.Authorization='Bearer '+process.env.GROQ_API_KEY;body={model:'canopylabs/orpheus-v1-english',input:text,voice:'austin',response_format:'wav'};
 }else if(id.startsWith('openrouter:')){
  url='https://openrouter.ai/api/v1/audio/speech';headers.Authorization='Bearer '+process.env.OPENROUTER_API_KEY_SUU;body={model:process.env.SUU_OPENROUTER_TTS_MODEL,input:text,voice:process.env.SUU_OPENROUTER_TTS_VOICE||'alloy',response_format:'mp3'};type='audio/mpeg';
 }else{
  const endpoint=new URL(process.env.SUU_VICTUS_TTS_API_BASE_URL!);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('Victus requiere endpoint HTTPS protegido');
  url=endpoint.href.replace(/\/$/,'')+'/synthesize';headers.Authorization='Bearer '+process.env.SUU_VICTUS_TTS_API_TOKEN;
  if(process.env.SUU_VICTUS_CF_ACCESS_CLIENT_ID&&process.env.SUU_VICTUS_CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=process.env.SUU_VICTUS_CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=process.env.SUU_VICTUS_CF_ACCESS_CLIENT_SECRET}
  body={text};
 }
 const res=await fetch(url,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(43000)]),cache:'no-store',redirect:'error'});
 const bytes=await bounded(res,id.startsWith('gemini:')?5_000_000:3_000_000);
 if(id.startsWith('gemini:')){
  const data=JSON.parse(bytes.toString('utf8'));const parts=data.candidates?.[0]?.content?.parts;const inline=Array.isArray(parts)?parts.find((p:{inlineData?:unknown})=>p.inlineData)?.inlineData:null;
  if(!inline||typeof inline.data!=='string'||inline.data.length>4_000_000)throw new Error('Gemini no devolvió audio');
  const audio=Buffer.from(inline.data,'base64');if(inline.mimeType?.startsWith('audio/wav')){if(audio.length<100||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE')throw new Error('WAV Gemini inválido');return {audio,type:'audio/wav',provider:'gemini'}};
  if(!/^audio\/(?:l16|pcm)/i.test(inline.mimeType||''))throw new Error('Formato Gemini no admitido');
  const rate=/rate=(\d+)/.exec(inline.mimeType)?.[1];if(rate&&rate!=='24000')throw new Error('Frecuencia Gemini inesperada');
  return {audio:pcmWav(audio),type:'audio/wav',provider:'gemini'};
 }
 if(type==='audio/wav'&&(!bytes.subarray(0,4).equals(Buffer.from('RIFF'))||bytes.toString('ascii',8,12)!=='WAVE'))throw new Error('WAV inválido');
 if(bytes.length<100||!res.headers.get('content-type')?.startsWith('audio/'))throw new Error('El proveedor no devolvió audio');
 return {audio:bytes,type,provider:id.split(':')[0]};
}
