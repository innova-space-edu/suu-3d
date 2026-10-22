import * as THREE from "three";
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
 // Smooth the original diamond-shaped side bulges into a continuous, fuller oval.
 const widths=new Map<number,number>();
 for(let i=0;i<p.count;i++){const key=Math.round(p.getY(i)*100000);widths.set(key,Math.max(widths.get(key)||0,Math.abs(p.getX(i))))}
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),rawY=(y+.05)/1.22;
  const ring=widths.get(Math.round(y*100000))||1;
  const jaw=Math.max(0,Math.min(1,(-y-.4)/.8));
  const width=Math.sqrt(Math.max(0,1-rawY*rawY))*(.98-.09*jaw*jaw);
  p.setX(i,x*width/ring);
  if(z>.5)p.setZ(i,z-.035*Math.exp(-.5*((x/.18)**2+((y+.25)/.28)**2)));
 }
 // Preserve subtle eye/lip pigmentation from the GLB, without bright separate objects.
 const originalColor=surface.getAttribute("color"),colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const r=originalColor?.getX(i)??.19,g=originalColor?.getY(i)??.67,b=originalColor?.getZ(i)??.88;
  colors.set([r*.72,g*.82,b*.95],i*3);
 }
 surface.setAttribute("color",new THREE.BufferAttribute(colors,3));
 surface.computeVertexNormals();surface.computeBoundingSphere();
 const cloud=new THREE.BufferGeometry();
 for(const [name,width] of [["position",3],["normal",3],["color",3],["aImportance",1]] as const)
  cloud.setAttribute(name,new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS*width),width).setUsage(THREE.DynamicDrawUsage));
 cloud.setDrawRange(0,0);
 // Bounds are explicit: zero-filled progressive buffers must not cache a zero-radius sphere.
 cloud.boundingSphere=surface.boundingSphere!.clone();cloud.boundingSphere.radius+=.02;
 return {surface,cloud,dispose:()=>{surface!.dispose();cloud.dispose()}};
}
