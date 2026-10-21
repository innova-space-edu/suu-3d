"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {FaceLandmarker} from "@mediapipe/tasks-vision";
export type FaceMotion={yaw:number;pitch:number;roll:number;gazeX:number;gazeY:number;blink:number;smile:number;mouth:number};
export const NEUTRAL_FACE:FaceMotion={yaw:0,pitch:0,roll:0,gazeX:0,gazeY:0,blink:0,smile:0,mouth:0};
export type TrackerState="off"|"loading"|"tracking"|"no-face"|"error";
const clamp=(n:number,min=-1,max=1)=>Math.max(min,Math.min(max,n));
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
   try{localModel=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:modelUrl,delegate:"GPU"},runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:true})}
   catch{localModel=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:modelUrl,delegate:"CPU"},runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:true})}
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
     const [l,r,nose,chin,forehead]=[point(33),point(263),point(1),point(152),point(10)];
     const centerX=(l.x+r.x)/2,centerY=(l.y+r.y)/2,span=Math.max(.1,Math.abs(r.x-l.x));
     const a=found.faceBlendshapes?.[0]?.categories||[];
     const weight=(name:string)=>a.find(x=>x.categoryName===name)?.score||0;
     setMotion(prev=>{
      const smoothing=.24,blend=(old:number,v:number)=>old+(clamp(v)*.95-old)*smoothing;
      const dx=r.x-l.x,dy=r.y-l.y;
      return {yaw:blend(prev.yaw,(nose.x-centerX)/span*1.2),pitch:blend(prev.pitch,((forehead.y+chin.y)/2-nose.y)*1.4),roll:blend(prev.roll,Math.atan2(dy,dx)*1.5),
        gazeX:blend(prev.gazeX,-(nose.x-.5)*1.3),gazeY:blend(prev.gazeY,(nose.y-.5)*1.2),
        blink:Math.max(0,Math.min(1,(weight("eyeBlinkLeft")+weight("eyeBlinkRight"))/2)),
        smile:Math.max(0,Math.min(1,(weight("mouthSmileLeft")+weight("mouthSmileRight"))/2)),
        mouth:Math.max(0,Math.min(1,weight("jawOpen")))};
     });
    }catch{setError("Se interrumpió el análisis facial");cleanup()}
   };
   frame.current=requestAnimationFrame(loop);
  }catch(e){
   localStream?.getTracks().forEach(t=>t.stop());
   localModel?.close();
   if(generation.current===ticket){setStatus("error");setError(e instanceof Error?e.message:"No se pudo iniciar el seguimiento facial")}
  }
 },[cleanup]);
 const active=status!=="off"&&status!=="error";
 return {status,motion,error,active,start,stop:cleanup};
}
