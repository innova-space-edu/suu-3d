export type MicrophonePreferences={deviceId?:string;autoGainControl?:boolean};
export function validMicrophonePreferences(value:unknown):value is MicrophonePreferences {
 if(!value||typeof value!=="object")return false;const v=value as MicrophonePreferences;return (v.deviceId===undefined||typeof v.deviceId==="string"&&v.deviceId.length<=512)&&(v.autoGainControl===undefined||typeof v.autoGainControl==="boolean");
}
export const speechSilenceMs=(brief:boolean)=>brief?600:1150;
export class SpeechEndpoint {
 voiceSeen=false;
 private frames=0;
 private lastVoice=0;
 constructor(private readonly brief=false){}
 update(rms:number,now:number){
  if(rms>.022){if(++this.frames>=2){this.voiceSeen=true;this.lastVoice=now}}else this.frames=0;
  return this.voiceSeen&&now-this.lastVoice>speechSilenceMs(this.brief);
 }
}
export type RecognitionInput={start(track?:MediaStreamTrack):void};
export type MicrophoneMode="off"|"standard"|"browser";
export async function disableNoiseReduction(track:Pick<MediaStreamTrack,"applyConstraints"|"getSettings">){
 await track.applyConstraints({noiseSuppression:false});
 if(track.getSettings().noiseSuppression===true)throw new Error("El navegador mantuvo la reducción de ruido activa.");
}
/** Mono speech with echo cancellation; gain is opt-in and isolation stays off. */
export function microphoneConstraints(reduceNoise:boolean,preferences:MicrophonePreferences={}):MediaTrackConstraints&{voiceIsolation:boolean}{
 return {noiseSuppression:reduceNoise,echoCancellation:true,autoGainControl:preferences.autoGainControl===true,voiceIsolation:false,channelCount:1,...(preferences.deviceId?{deviceId:{exact:preferences.deviceId}}:{})};
}
// audioTrack input is supported on desktop Chromium 135+, not Chromium Android or Safari.
export function supportsRecognitionTrack(ua:string){
 if(/Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|OPR\//i.test(ua))return false;
 const version=/(?:Edg|Chrome)\/(\d+)/.exec(ua);return Boolean(version&&Number(version[1])>=135);
}
export async function startMicrophoneRecognition(rec:RecognitionInput,reduceNoise:boolean,platform:{userAgent:string;capture:(audio:MediaTrackConstraints)=>Promise<MediaStream>},cancelled:()=>boolean,preferences:MicrophonePreferences={}):Promise<{stream?:MediaStream;mode:MicrophoneMode}|null>{
 if(cancelled())return null;
 if((!reduceNoise&&!preferences.deviceId&&!preferences.autoGainControl)||!supportsRecognitionTrack(platform.userAgent)){rec.start();return {mode:"browser"}}
 const stream=await platform.capture(microphoneConstraints(reduceNoise,preferences));
 const release=()=>stream.getTracks().forEach(t=>t.stop());
 if(cancelled()){release();return null}
 try{
  const track=stream.getAudioTracks()[0];
  if(!track||track.kind!=="audio"||track.readyState!=="live")throw new Error("No hay una pista de micrófono disponible.");
  try{rec.start(track)}catch(e){
   if(e instanceof Error&&(e.name==="NotSupportedError"||e.name==="TypeError")){release();rec.start();return {mode:"browser"}}
   throw e;
  }
  if(cancelled()){release();return null}
  return {stream,mode:track.getSettings().noiseSuppression===true?"standard":"browser"};
 }catch(e){release();throw e}
}
