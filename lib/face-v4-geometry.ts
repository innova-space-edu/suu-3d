import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
export const MAX_FACE_POINTS=100000;
export type PointCount=25000|50000|100000;
export type FaceView="frente"|"izquierda"|"derecha";
export type CleanMode="puntos"|"contornos"|"superficie";
export type FaceGeometryBundle={surface:THREE.BufferGeometry;cloud:THREE.BufferGeometry;dispose:()=>void};

// The visible surface and all particles share this single source of geometry.
export async function loadFaceGeometry(signal:AbortSignal):Promise<FaceGeometryBundle>{
 const response=await fetch("/models/suu-face-anatomical.glb",{signal});
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
 surface.computeVertexNormals();
 surface.computeBoundingSphere();
 const cloud=new THREE.BufferGeometry();
 for(const [name,width] of [["position",3],["normal",3],["color",3],["aImportance",1]] as const)
  cloud.setAttribute(name,new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS*width),width).setUsage(THREE.DynamicDrawUsage));
 cloud.setDrawRange(0,0);
 // Bounds are explicit: zero-filled progressive buffers must not cache a zero-radius sphere.
 cloud.boundingSphere=surface.boundingSphere!.clone();cloud.boundingSphere.radius+=.02;
 return {surface,cloud,dispose:()=>{surface!.dispose();cloud.dispose()}};
}
