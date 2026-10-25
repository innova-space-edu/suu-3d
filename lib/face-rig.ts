import * as THREE from "three";
export const FACE_CHANNELS=["jaw","smile","frown","pucker","wide","blinkLeft","blinkRight","browUp","browDown","lookLeft","lookRight","lookUp","lookDown"] as const;
export type FaceChannel=typeof FACE_CHANNELS[number];
export type FacePose=Partial<Record<FaceChannel,number>>;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const g=(v:number,s:number)=>Math.exp(-.5*(v/s)**2);
/** Small, bounded anatomical displacements on the approved neutral mesh. Eyes stay rigid. */
export function facialDelta(channel:FaceChannel,x:number,y:number,z:number,eyeball=false):[number,number,number]{
 if(channel.startsWith("look")){
  if(!eyeball)return [0,0,0];
  const cx=x>=0?.29544:-.29544,cy=.099984,cz=.686736,dx=x-cx,dy=y-cy,dz=z-cz;
  if(channel==="lookLeft"||channel==="lookRight"){
   const a=channel==="lookLeft"?-.28:.28;
   return [dx*Math.cos(a)+dz*Math.sin(a)-dx,0,-dx*Math.sin(a)+dz*Math.cos(a)-dz];
  }
  const a=channel==="lookUp"?-.20:.20;
  return [0,dy*Math.cos(a)-dz*Math.sin(a)-dy,dy*Math.sin(a)+dz*Math.cos(a)-dz];
 }
 if(eyeball)return [0,0,0];
 const front=smooth(.48,.82,z),ax=Math.abs(x);
 // Flat support over the lip body, smooth falloff into cheeks. No sign(x) seam at the midline.
 const lip=(1-smooth(.20,.43,ax))*g(y+.545,.105)*front;
 const corner=(g(x-.225,.10)+g(x+.225,.10))*g(y+.525,.105)*front;
 switch(channel){
  case "jaw":{
   // Narrow transition at the lip seam; broader transition into each cheek, avoiding a horizontal crease.
   const seam=-.548+.030*Math.min(1,(x/.25)**2),width=.018+.15*smooth(.19,.48,ax);
   const lower=(1-smooth(seam-width,seam+width,y))*smooth(-1.22,-.86,y)*(1-smooth(.48,.78,ax))*smooth(.12,.65,z);
   const a=.22*lower,dy=y+.25,dz=z-.38;
   return [0,dy*Math.cos(a)-dz*Math.sin(a)-dy,dy*Math.sin(a)+dz*Math.cos(a)-dz];
  }
  case "smile":{
   const cheek=(g(x-.38,.15)+g(x+.38,.15))*g(y+.31,.16)*front;
   // Pull corners outward/up and carry the lip body smoothly, preserving the central cupid's bow.
   const lift=.042*(1-Math.exp(-.5*(x/.17)**2))*lip;
   return [.045*Math.tanh(x/.20)*lip+.008*Math.tanh(x/.3)*cheek,lift+.012*cheek,-.010*corner];
  }
  case "frown":{
   // Serious = gently pressed lips, attentive eyelids and subtly lowered inner brows, rather than sadness.
   const eyes=(g(x-.295,.12)+g(x+.295,.12))*g(y-.10,.095)*smooth(.55,.68,z)*(1-smooth(.86,.98,z));
   const brows=(g(x-.27,.16)+g(x+.27,.16))*g(y-.32,.105)*front;
   return [-.008*Math.tanh(x/.20)*brows,(-.545-y)*.14*lip-.006*corner+(.10-y)*.16*eyes-.020*brows,-.008*lip];
  }
  case "pucker":return [-x*.14*lip,(-.545-y)*.04*lip,.045*lip];
  case "wide":return [.040*Math.tanh(x/.20)*lip,-.004*lip,0];
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
 return [0,0,0];
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
