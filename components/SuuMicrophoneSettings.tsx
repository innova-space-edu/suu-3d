"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {microphoneConstraints,type MicrophonePreferences} from "@/lib/microphone";
type Props={value:MicrophonePreferences;onChange:(value:MicrophonePreferences)=>void;reduceNoise:boolean};
/** Explicit, local level check. No recording, upload or speaker monitoring. */
export default function SuuMicrophoneSettings({value,onChange,reduceNoise}:Props){
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[testing,setTesting]=useState(false),[level,setLevel]=useState(0),[message,setMessage]=useState("Selecciona tu micrófono o usa la entrada predeterminada del sistema.");
 const cleanup=useRef<()=>void>(()=>{}),generation=useRef(0),mounted=useRef(true);
 const refresh=useCallback(async()=>{try{const inputs=(await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==="audioinput");if(mounted.current)setDevices(inputs)}catch{if(mounted.current)setMessage("No se pudieron listar los micrófonos.")}},[]);
 const stop=useCallback(()=>{generation.current++;cleanup.current();cleanup.current=()=>{};if(mounted.current){setTesting(false);setLevel(0)}},[]);
 useEffect(()=>{mounted.current=true;void refresh();navigator.mediaDevices?.addEventListener("devicechange",refresh);return()=>{mounted.current=false;stop();navigator.mediaDevices?.removeEventListener("devicechange",refresh)}},[refresh,stop]);
 const test=async()=>{
  stop();const ticket=generation.current;setTesting(true);setMessage("Permite el micrófono y habla durante cinco segundos.");
  let stream:MediaStream|undefined,context:AudioContext|undefined;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:microphoneConstraints(reduceNoise,value),video:false});
   if(ticket!==generation.current){stream.getTracks().forEach(t=>t.stop());return}
   context=new AudioContext();const ctx=context,captured=stream;let tick:ReturnType<typeof setInterval>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
   cleanup.current=()=>{if(tick)clearInterval(tick);if(timeout)clearTimeout(timeout);captured.getTracks().forEach(t=>t.stop());void ctx.close().catch(()=>{})};
   await context.resume();if(ticket!==generation.current)return;
   if(context.state!=="running")throw new Error("El navegador no pudo activar el medidor.");
   const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);
   const samples=new Float32Array(analyser.fftSize);let maxRms=0,peak=0;
   tick=setInterval(()=>{analyser.getFloatTimeDomainData(samples);let sum=0;for(const n of samples){sum+=n*n;peak=Math.max(peak,Math.abs(n))}const rms=Math.sqrt(sum/samples.length);maxRms=Math.max(maxRms,rms);setLevel(Math.min(100,Math.round(rms*500)))},80);
   timeout=setTimeout(()=>{stop();setMessage(peak>=.98?"El nivel llegó a saturación. Baja la ganancia del micrófono y repite.":maxRms<.015?"Se detectó poco nivel. Acerca el micrófono o prueba la ganancia automática.":"La entrada tiene un nivel utilizable. Comprueba también la transcripción en conversación.")},5000);
   void refresh();
  }catch(e){stream?.getTracks().forEach(t=>t.stop());if(context)void context.close().catch(()=>{});if(ticket===generation.current){stop();setMessage(e instanceof Error&&e.name==="NotAllowedError"?"Permite el acceso al micrófono en el navegador.":"No se pudo abrir esa entrada. Comprueba la conexión o elige Predeterminado.")}}
 };
 return <fieldset className="microphoneSettings"><legend>Micrófono</legend>
  <label>Entrada de audio<select disabled={testing} value={value.deviceId||""} onChange={e=>onChange({...value,deviceId:e.target.value})}><option value="">Predeterminado del sistema</option>{value.deviceId&&!devices.some(d=>d.deviceId===value.deviceId)&&<option value={value.deviceId}>Entrada guardada no disponible</option>}{devices.filter(d=>d.deviceId!=="default"&&d.deviceId!=="communications").map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`Micrófono ${i+1}`}</option>)}</select></label>
  <label>Ganancia automática para voz baja<input disabled={testing} type="checkbox" checked={Boolean(value.autoGainControl)} onChange={e=>onChange({...value,autoGainControl:e.target.checked})}/></label>
  <button disabled={testing} onClick={()=>void test()}>Autorizar y probar micrófono (5 s)</button>{testing&&<button onClick={stop}>Detener prueba</button>}
  <meter min={0} max={100} value={level} aria-label="Nivel de entrada del micrófono"/><p role="status">{message}</p>
  <small>Prueba local, sin grabar ni enviar audio. Cancelación de eco y entrada mono; la reducción de ruido se mantiene limitada a auriculares. El navegador puede ignorar ajustes no compatibles. Con STT Dell se usa la entrada elegida; reconocimiento del navegador sin soporte de pista usa el micrófono predeterminado de Windows.</small>
 </fieldset>;
}
