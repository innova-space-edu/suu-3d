import * as THREE from "three";
export const FACE_CHANNELS=["jaw","smile","frown","pucker","wide","blinkLeft","blinkRight","browUp","browDown"] as const;
export type FaceChannel=typeof FACE_CHANNELS[number];
export type FacePose=Partial<Record<FaceChannel,number>>;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const g=(v:number,s:number)=>Math.exp(-.5*(v/s)**2);
/** Small, bounded anatomical displacements on the approved neutral mesh. Eyes stay rigid. */
export function facialDelta(channel:FaceChannel,x:number,y:number,z:number,eyeball=false):[number,number,number]{
 if(eyeball)return [0,0,0];
 const front=smooth(.42,.78,z),mouth=g(x,.23)*g(y+.54,.13)*front;
 switch(channel){
  case "jaw":{
   const lower=(1-smooth(-.555,-.515,y))*smooth(-1.18,-.84,y)*g(x,.6)*smooth(.12,.6,z);
   const a=.24*lower,dy=y+.27,dz=z-.38;
   return [0,dy*Math.cos(a)-dz*Math.sin(a)-dy,dy*Math.sin(a)+dz*Math.cos(a)-dz];
  }
  case "smile":return [Math.sign(x)*.045*mouth,.075*mouth*Math.min(1,Math.abs(x)/.17),.012*mouth];
  case "frown":return [0,-.055*mouth*Math.min(1,Math.abs(x)/.17),0];
  case "pucker":return [-x*.22*mouth,0,.075*mouth];
  case "wide":return [x*.22*mouth,-.014*mouth,0];
  case "blinkLeft":case "blinkRight":{
   const center=channel==="blinkLeft"?.295:-.295;
   const mask=g(x-center,.11)*g(y-.10,.105)*smooth(.55,.67,z)*(1-smooth(.84,.96,z));
   return [0,(.10-y)*mask*1.28,.025*mask];
  }
  case "browUp":case "browDown":{
   const mask=(g(x-.30,.16)+g(x+.30,.16))*g(y-.32,.12)*front;
   return [0,(channel==="browUp"?.055:-.035)*mask,0];
  }
 }
}
export function addFaceRig(surface:THREE.BufferGeometry){
 const position=surface.getAttribute("position"),normal=surface.getAttribute("normal");
 // The GLB packs two 49×97 eyeballs after the connected skin; do not deform their spheres.
 const eyeStart=position.count-2*49*97;
 surface.morphTargetsRelative=true;
 surface.morphAttributes.position=[];surface.morphAttributes.normal=[];
 for(const channel of FACE_CHANNELS){
  const delta=new Float32Array(position.count*3),target=new Float32Array(position.array as Float32Array);
  for(let i=0;i<position.count;i++){
   const d=facialDelta(channel,position.getX(i),position.getY(i),position.getZ(i),i>=eyeStart);
   delta.set(d,i*3);for(let k=0;k<3;k++)target[i*3+k]+=d[k];
  }
  const temp=new THREE.BufferGeometry();temp.setAttribute("position",new THREE.BufferAttribute(target,3));temp.setIndex(surface.index);temp.computeVertexNormals();
  const n=temp.getAttribute("normal"),nd=new Float32Array(delta.length);
  for(let i=0;i<nd.length;i++)nd[i]=n.array[i]-normal.array[i];
  const attr=new THREE.BufferAttribute(delta,3);attr.name=channel;
  surface.morphAttributes.position!.push(attr);surface.morphAttributes.normal!.push(new THREE.BufferAttribute(nd,3));temp.dispose();
 }
}
export function poseWeights(pose:FacePose){return FACE_CHANNELS.map(k=>Math.max(0,Math.min(1,Number.isFinite(pose[k])?pose[k]!:0)))}
