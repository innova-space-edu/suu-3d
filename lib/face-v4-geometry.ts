import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
export const MAX_FACE_POINTS=100000;
export type PointCount=25000|50000|100000;
export type FaceView="frente"|"izquierda"|"derecha";
export type CleanMode="puntos"|"contornos"|"superficie";
export type FaceGeometryBundle={surface:THREE.BufferGeometry;cloud:THREE.BufferGeometry;dispose:()=>void};

// The visible surface and all particles share this single source of geometry.
export async function loadFaceGeometry(signal:AbortSignal):Promise<FaceGeometryBundle>{
 const response=await fetch("/models/suu-face-v4.glb",{signal});
 if(!response.ok)throw new Error(`No se pudo cargar la malla facial (${response.status}).`);
 const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),"");
 let surface:THREE.BufferGeometry|undefined;
 gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(object=>{
  if(object instanceof THREE.Mesh){
   if(!surface){const meshGeometry=object.geometry.clone() as THREE.BufferGeometry;meshGeometry.applyMatrix4(object.matrixWorld);surface=meshGeometry}
   object.geometry.dispose();
   for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
  }
 });
 if(!surface)throw new Error("El archivo no contiene una superficie facial.");
 if(signal.aborted){surface.dispose();throw new DOMException("Cancelado","AbortError")}
 // Repair source winding before normals/occlusion: the supplied GLB faces inward.
 const p=surface.getAttribute("position"),index=surface.index;
 if(index){
  let volume=0;
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   volume+=p.getX(a)*(p.getY(b)*p.getZ(c)-p.getZ(b)*p.getY(c))+p.getY(a)*(p.getZ(b)*p.getX(c)-p.getX(b)*p.getZ(c))+p.getZ(a)*(p.getX(b)*p.getY(c)-p.getY(b)*p.getX(c));
  }
  if(volume<0)for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b)}
 }
 // Reference-guided sculpt: one continuous surface; profiles remain an approximation.
 const widths=new Map<number,number>();
 for(let i=0;i<p.count;i++){const key=Math.round(p.getY(i)*100000);widths.set(key,Math.max(widths.get(key)||0,Math.abs(p.getX(i))))}
 const colors=new Float32Array(p.count*3);
 const gaussian=(v:number,c:number,s:number)=>Math.exp(-.5*((v-c)/s)**2);
 for(let i=0;i<p.count;i++){
  const oldX=p.getX(i),y=p.getY(i),oldZ=p.getZ(i),rawY=(y+.05)/1.22;
  const ring=widths.get(Math.round(y*100000))||1;
  const jaw=Math.max(0,Math.min(1,(-y-.28)/.94));
  const width=Math.sqrt(Math.max(0,1-rawY*rawY))*(.94-.20*jaw);
  const x=oldX*width/ring;
  p.setX(i,x);
  let pigment=1,blue=.98,green=.46,red=.055;
  if(oldZ>0){
   const front=Math.sqrt(Math.max(0,1-(oldX/ring)**2));
   let z=.69*Math.sqrt(Math.max(0,1-rawY*rawY))*front;
   // Broad cheeks and a soft chin instead of the previous oval mask.
   z+=front**4*(.10*gaussian(Math.abs(x),.48,.19)*gaussian(y,-.31,.24)+.10*gaussian(x,0,.27)*gaussian(y,-.99,.14));
   const ex=(Math.abs(x)-.38)/.235;
   const opening=.105*Math.pow(Math.max(0,1-ex*ex),.65);
   const eyeY=.035+.025*ex;
   const dy=y-eyeY;
   const eyeRegion=gaussian(Math.abs(x),.38,.25)*gaussian(y,.05,.17);
   z-=.105*eyeRegion;
   // Upper/lower lids are ridges in this same surface, not floating lines.
   if(Math.abs(ex)<1.15){
    z+=.060*gaussian(Math.abs(dy),opening,.022)*gaussian(ex,0,.72);
    if(Math.abs(ex)<1 && Math.abs(dy)<opening){
     z+=.055*Math.max(0,1-ex*ex)*Math.max(0,1-(dy/Math.max(.001,opening))**2);
     const iris=Math.hypot((Math.abs(x)-.38)/.088,dy/.088);
     if(iris<.43){pigment=.035;}
     else if(iris<1){pigment=.65+.32*Math.sin(Math.atan2(dy,Math.abs(x)-.38)*38)**2;red=.025;green=.45;blue=1;}
     else {pigment=.68;red=.19;green=.53;blue=.83;}
    }
   }
   z+=.065*gaussian(Math.abs(x),.38,.23)*gaussian(y,.23+.055*gaussian(ex,0,.7),.055);
   // Bridge, rounded tip, nasal wings and nostril recesses.
   z+=.20*gaussian(x,0,.105)*gaussian(y,-.12,.30);
   z+=.22*gaussian(x,0,.13)*gaussian(y,-.36,.105);
   z+=.10*gaussian(Math.abs(x),.135,.058)*gaussian(y,-.40,.068);
   z-=.075*gaussian(Math.abs(x),.105,.037)*gaussian(y,-.45,.025);
   pigment*=1-.65*gaussian(Math.abs(x),.105,.038)*gaussian(y,-.45,.022);
   // Cupid's bow, lower lip and a narrow mouth seam.
   const lipWidth=gaussian(x,0,.23),seam=-.70+.025*(x/.26)**2;
   const upper=seam+.052+.024*gaussian(Math.abs(x),.075,.04);
   z+=lipWidth*(.095*gaussian(y,upper,.034)+.11*gaussian(y,seam-.060,.044)-.045*gaussian(y,seam,.012));
   pigment*=1-.78*lipWidth*gaussian(y,seam,.012);
   p.setZ(i,z);
  }
  colors.set([red*pigment,green*pigment,blue*pigment],i*3);
 }
 surface.setAttribute("color",new THREE.BufferAttribute(colors,3));
 surface.computeVertexNormals();
 // Complete the silhouette with sculpted auricles and a neck/shoulder base.
 const parts:THREE.BufferGeometry[]=[surface];
 const paint=(g:THREE.BufferGeometry)=>{
  g.deleteAttribute("uv");
  const c=new Float32Array(g.getAttribute("position").count*3);
  for(let i=0;i<c.length;i+=3)c.set([.055,.46,.98],i);
  g.setAttribute("color",new THREE.BufferAttribute(c,3));return g;
 };
 surface.deleteAttribute("uv");
 for(const side of [-1,1]){
  const ear=new THREE.SphereGeometry(1,72,48),ep=ear.getAttribute("position");
  for(let i=0;i<ep.count;i++){
   const u=ep.getX(i),v=ep.getY(i),w=ep.getZ(i),r=Math.hypot(u,v);
   const relief=w>=0?.035+.10*gaussian(r,.80,.12)-.025*gaussian(r,.30,.25):w*.07;
   ep.setXYZ(i,side*(.87+.14*u),-.14+.27*v,.015+relief+.05*u);
  }
  // Reflection changes handedness; maintain outward-facing triangles.
  if(side<0&&ear.index)for(let i=0;i<ear.index.count;i+=3){const b=ear.index.getX(i+1);ear.index.setX(i+1,ear.index.getX(i+2));ear.index.setX(i+2,b)}
  ear.computeVertexNormals();parts.push(paint(ear));
 }
 const profile=[new THREE.Vector2(1.16,-1.88),new THREE.Vector2(.85,-1.74),new THREE.Vector2(.55,-1.55),new THREE.Vector2(.37,-1.32),new THREE.Vector2(.34,-1.12),new THREE.Vector2(.38,-.87)];
 const curve=new THREE.SplineCurve(profile);
 const neck=new THREE.LatheGeometry(curve.getPoints(90),180),np=neck.getAttribute("position");
 for(let i=0;i<np.count;i++)np.setZ(i,np.getZ(i)*.76-.18);
 neck.computeVertexNormals();parts.push(paint(neck));
 const assembled=mergeGeometries(parts,false);
 if(!assembled){parts.forEach(g=>g.dispose());throw new Error("No se pudo ensamblar la cabeza")}
 parts.forEach(g=>g.dispose());surface=assembled;
 surface.computeBoundingSphere();
 const cloud=new THREE.BufferGeometry();
 for(const [name,width] of [["position",3],["normal",3],["color",3],["aImportance",1]] as const)
  cloud.setAttribute(name,new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS*width),width).setUsage(THREE.DynamicDrawUsage));
 cloud.setDrawRange(0,0);
 // Bounds are explicit: zero-filled progressive buffers must not cache a zero-radius sphere.
 cloud.boundingSphere=surface.boundingSphere!.clone();cloud.boundingSphere.radius+=.02;
 return {surface,cloud,dispose:()=>{surface!.dispose();cloud.dispose()}};
}
