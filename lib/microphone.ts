export type RecognitionInput={start(track?:MediaStreamTrack):void};
export type MicrophoneMode="off"|"standard"|"browser";
export async function disableNoiseReduction(track:Pick<MediaStreamTrack,"applyConstraints"|"getSettings">){
 await track.applyConstraints({noiseSuppression:false});
 if(track.getSettings().noiseSuppression===true)throw new Error("El navegador mantuvo la reducción de ruido activa.");
}
/** No hard gate, strong voice isolation or automatic gain pumping. */
export function microphoneConstraints(reduceNoise:boolean):MediaTrackConstraints&{voiceIsolation:boolean}{
 return {noiseSuppression:reduceNoise,echoCancellation:true,autoGainControl:false,voiceIsolation:false};
}
// audioTrack input is supported on desktop Chromium 135+, not Chromium Android or Safari.
export function supportsRecognitionTrack(ua:string){
 if(/Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|OPR\//i.test(ua))return false;
 const version=/(?:Edg|Chrome)\/(\d+)/.exec(ua);return Boolean(version&&Number(version[1])>=135);
}
export async function startMicrophoneRecognition(rec:RecognitionInput,reduceNoise:boolean,platform:{userAgent:string;capture:(audio:MediaTrackConstraints)=>Promise<MediaStream>},cancelled:()=>boolean):Promise<{stream?:MediaStream;mode:MicrophoneMode}|null>{
 if(cancelled())return null;
 if(!reduceNoise||!supportsRecognitionTrack(platform.userAgent)){rec.start();return {mode:"browser"}}
 const stream=await platform.capture(microphoneConstraints(true));
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
