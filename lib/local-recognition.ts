/** Use on-device transcription when the browser already has the matching
 * language pack. Never install/download a pack or require cloud credentials.
 * If unsupported, the existing browser recognition remains as fallback.
 */
export type OnDeviceSpeechCtor={available?:(options:{langs:string[];processLocally:boolean})=>Promise<string>};
export type OnDeviceRecognition={processLocally?:boolean};
export async function preferOnDeviceRecognition(constructorValue:unknown,recognitionValue:unknown,locale:string):Promise<boolean>{
 const ctor=constructorValue as OnDeviceSpeechCtor;
 const recognition=recognitionValue as OnDeviceRecognition;
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
