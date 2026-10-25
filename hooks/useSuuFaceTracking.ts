"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {attentionTarget} from "@/lib/face-attention";
import type {FaceLandmarker} from "@mediapipe/tasks-vision";
export type FaceMotion={gazeX:number;gazeY:number};
export const NEUTRAL_FACE:FaceMotion={gazeX:0,gazeY:0};
export type TrackerState="off"|"loading"|"tracking"|"no-face"|"error";
/** Camera frames are processed in-memory on-device. No canvas preview or network upload. */
export function useSuuFaceTracking(){
 const [status,setStatus]=useState<TrackerState>("off");
 const [motion,setMotion]=useState<FaceMotion>(NEUTRAL_FACE);
 const [error,setError]=useState("");
 const stream=useRef<MediaStream|null>(null),video=useRef<HTMLVideoElement|null>(null),model=useRef<FaceLandmarker|null>(null);
 const frame=useRef(0),generation=useRef(0),lastTick=useRef(0),wasFace=useRef(false);
 const cleanup=useCallback(()=>{
  generation.current++;
  cancelAnimationFrame(frame.current);frame.current=0;
  stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
  if(video.current){video.current.pause();video.current.srcObject=null;video.current=null}
  model.current?.close();model.current=null;setMotion(NEUTRAL_FACE);setStatus("off");setError("");
 },[]);
 useEffect(()=>()=>{cleanup()},[cleanup]);
 const start=useCallback(async()=>{
  if(stream.current)return;
  if(!navigator.mediaDevices?.getUserMedia){setError("Este navegador no admite cámara.");setStatus("error");return}
  const ticket=++generation.current;
  setStatus("loading");setError("");
  let localStream:MediaStream|null=null,localModel:FaceLandmarker|null=null;
  try{
   // Import only after explicit user action; code and ML model are downloaded, not camera frames.
   const [{FaceLandmarker,FilesetResolver},captured]=await Promise.all([
    import("@mediapipe/tasks-vision"),
    navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:"user",width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24}}})
   ]);localStream=captured;
   if(generation.current!==ticket){captured.getTracks().forEach(t=>t.stop());return}
   const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm");
   const modelUrl="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
   try{localModel=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:modelUrl,delegate:"GPU"},runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:false})}
   catch{localModel=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:modelUrl,delegate:"CPU"},runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:false})}
   if(generation.current!==ticket){localModel.close();captured.getTracks().forEach(t=>t.stop());return}
   const element=document.createElement("video"); // not appended, never displayed
   element.autoplay=true;element.playsInline=true;element.muted=true;element.srcObject=captured;
   await element.play();
   video.current=element;stream.current=captured;model.current=localModel;lastTick.current=0;wasFace.current=false;
   setStatus("no-face");
   const loop=(now:number)=>{
    if(generation.current!==ticket||!video.current||!model.current)return;
    frame.current=requestAnimationFrame(loop);
    if(now-lastTick.current<75||video.current.readyState<2)return;lastTick.current=now;
    try{
     const found=model.current.detectForVideo(video.current,now);
     const lm=found.faceLandmarks?.[0];
     if(!lm){if(wasFace.current){setMotion(NEUTRAL_FACE);wasFace.current=false;setStatus("no-face")}return}
     if(!wasFace.current){setStatus("tracking");wasFace.current=true}
     const point=(n:number)=>lm[n]||{x:.5,y:.5,z:0};
     const [l,r]=[point(33),point(263)];
     const target=attentionTarget((l.x+r.x)/2,(l.y+r.y)/2);
     setMotion(prev=>({...NEUTRAL_FACE,gazeX:prev.gazeX+(target.gazeX-prev.gazeX)*.24,gazeY:prev.gazeY+(target.gazeY-prev.gazeY)*.24}));
    }catch{cleanup();setStatus("error");setError("Se interrumpió el análisis facial. Vuelve a activar la cámara.")}
   };
   frame.current=requestAnimationFrame(loop);
  }catch(e){
   localStream?.getTracks().forEach(t=>t.stop());
   localModel?.close();
   if(generation.current===ticket){setStatus("error");setError(e instanceof Error&&e.name==="NotAllowedError"?"Permite la cámara para suu-3d.vercel.app en los permisos del navegador y vuelve a intentarlo.":e instanceof Error?e.message:"No se pudo iniciar el seguimiento facial")}
  }
 },[cleanup]);
 const active=status!=="off"&&status!=="error";
 return {status,motion,error,active,start,stop:cleanup};
}
