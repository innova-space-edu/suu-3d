"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {ObjectDetector} from "@mediapipe/tasks-vision";
import {FairMotion,type FairCalibration,type PersonBox} from "@/lib/fair-flow";

export function useFairCamera(onFrame:(boxes:PersonBox[],now:number,activity:{entering:boolean;leaving:boolean})=>void,calibration:FairCalibration|null){
 const [status,setStatus]=useState<"off"|"loading"|"ready"|"error">("off"),[error,setError]=useState("");
 const video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null),model=useRef<ObjectDetector|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),motion=useRef(new FairMotion());
 const callback=useRef(onFrame),settings=useRef(calibration);callback.current=onFrame;settings.current=calibration;
 const stop=useCallback(()=>{generation.current++;if(timer.current)clearTimeout(timer.current);timer.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;model.current?.close();model.current=null;if(video.current){video.current.pause();video.current.srcObject=null}video.current=null;motion.current=new FairMotion();setStatus("off")},[]);
 useEffect(()=>()=>stop(),[stop]);
 const start=useCallback(async()=>{
  stop();const ticket=generation.current;setStatus("loading");setError("");
  let captured:MediaStream|null=null,detector:ObjectDetector|null=null;
  try{
   captured=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:12,max:15}}});
   if(ticket!==generation.current){captured.getTracks().forEach(t=>t.stop());return}stream.current=captured;captured.getVideoTracks().forEach(track=>{track.onended=()=>{if(ticket!==generation.current)return;stop();setStatus("error");setError("La cámara se desconectó. Conéctala y repite la prueba sin voz.")}});
   const {FilesetResolver,ObjectDetector}=await import("@mediapipe/tasks-vision");
   const files=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm");
   if(ticket!==generation.current)return;
   detector=await ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite",delegate:"CPU"},runningMode:"VIDEO",categoryAllowlist:["person"],scoreThreshold:.5,maxResults:16});
   if(ticket!==generation.current){detector.close();return}model.current=detector;
   const element=document.createElement("video");element.muted=true;element.playsInline=true;element.srcObject=captured;video.current=element;await element.play();
   if(ticket!==generation.current)return;setStatus("ready");
   const loop=()=>{
    if(ticket!==generation.current||!model.current||!video.current)return;
    try{
     if(element.readyState>=2){const now=performance.now();const boxes=model.current.detectForVideo(element,now).detections.flatMap(d=>{const b=d.boundingBox;return b?[{x:Math.max(0,b.originX/element.videoWidth),y:Math.max(0,b.originY/element.videoHeight),width:Math.min(1,b.width/element.videoWidth),height:Math.min(1,b.height/element.videoHeight)}]:[]});callback.current(boxes,now,motion.current.update(boxes,now,settings.current))}
     timer.current=setTimeout(loop,250);
    }catch{stop();setStatus("error");setError("Se interrumpió la cámara. Detén la feria y vuelve a iniciar la prueba.")}
   };loop();
  }catch(e){captured?.getTracks().forEach(t=>t.stop());if(ticket===generation.current){if(detector&&model.current!==detector)detector.close();stop();setStatus("error");setError(e instanceof Error&&e.name==="NotAllowedError"?"Permite la cámara en el navegador para configurar la feria.":"No se pudo cargar la cámara o el detector. Comprueba conexión y permisos.")}}
 },[stop]);
 return {start,stop,video,status,error};
}
