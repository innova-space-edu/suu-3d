/** Use on-device transcription when the browser already has the matching
 * language pack. Never install/download a pack or require cloud credentials.
 * If unsupported, the existing browser recognition remains as fallback.
 */
export type OnDeviceSpeechCtor={available?:(options:{langs:string[];processLocally:boolean})=>Promise<string>};
export type OnDeviceRecognition={processLocally?:boolean};
export async function preferOnDeviceRecognition(ctor:OnDeviceSpeechCtor,recognition:OnDeviceRecognition,locale:string):Promise<boolean>{
 if(typeof ctor.available!=="function"||!("processLocally" in recognition))return false;
 try{
  // A broken experimental API must not freeze the microphone.
  const state=await Promise.race<string>([
   ctor.available({langs:[locale],processLocally:true}),
   new Promise(resolve=>setTimeout(()=>resolve("timeout"),900))
  ]);
  if(state==="available"){recognition.processLocally=true;return true}
 }catch{/* Browser may reject access to on-device speech packs. */}
 return false;
}
