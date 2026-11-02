import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=p=>ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const flowURI=uri(compile('lib/fair-flow.ts'));
const {FairFlow}=await import(flowURI);
test('a slow camera emits fresh arrival events after inference and never asks for microphone',async()=>{
 const names=['navigator','document','performance','setTimeout','clearTimeout','__fairReact','__fairVision'];
 const before=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 let now=0,next,frames=0,requested,stopped=false;
 const video={readyState:2,videoWidth:640,videoHeight:480,play:async()=>{},pause(){}};
 const fakeReact={useRef:v=>({current:v}),useState:v=>[v,()=>{}],useCallback:f=>f,useEffect:()=>{}};
 const fakeVision={FilesetResolver:{forVisionTasks:async()=>({})},ObjectDetector:{createFromOptions:async()=>({close(){},detectForVideo(_,at){assert.equal(at,now);now+=1700;return {detections:[{boundingBox:{originX:128+frames++*96,originY:96,width:96,height:288}}]}}})}};
 const globals={navigator:{mediaDevices:{getUserMedia:async options=>{requested=options;return {getTracks:()=>[{stop(){stopped=true}}],getVideoTracks:()=>[{}]}}}},document:{createElement:()=>video},performance:{now:()=>now},setTimeout:callback=>{next=callback;return 1},clearTimeout:()=>{},__fairReact:fakeReact,__fairVision:fakeVision};
 try{
  for(const [name,value]of Object.entries(globals))Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  const source=compile('hooks/useFairCamera.ts').replace(/import \{[^}]+\} from "react";/,'const {useCallback,useEffect,useRef,useState}=globalThis.__fairReact;').replace('"@/lib/fair-flow"',JSON.stringify(flowURI)).replace('await import("@mediapipe/tasks-vision")','globalThis.__fairVision');
  const {useFairCamera}=await import(uri(source));
  const flow=new FairFlow(true),events=[];
  const camera=useFairCamera((_,at,movement)=>{events.push(at);flow.observe(at,movement.entering,movement.leaving)},{version:1,axis:'x',direction:1,low:.2,high:.8});
  await camera.start();assert.equal(events[0],1700);assert.equal(requested.audio,false);
  now+=250;next();assert.equal(events[1],3650);assert.equal(flow.poll(now,true),'welcome');
  camera.stop();assert.equal(stopped,true);
 }finally{for(const name of names){if(before[name])Object.defineProperty(globalThis,name,before[name]);else delete globalThis[name]}}
});
