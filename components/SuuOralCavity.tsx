"use client";
import {useFrame} from "@react-three/fiber";
import {useRef} from "react";
import * as THREE from "three";
import type {LipSignal} from "@/hooks/useLipSync";
import {currentLipShape} from "@/hooks/useLipSync";

type Props={actuators:{current:Float64Array};frontZ:number;enabled:boolean;lipSync?:LipSignal};
const teeth=Array.from({length:8},(_,i)=>({
 x:(i-3.5)*.045,
 z:-.024-.022*Math.pow(Math.abs(i-3.5)/3.5,2),
 width:(i===0||i===7)?.018:.022
}));
/** Lightweight, articulated visual mouth insert. Not an anatomical dental scan.
 * The mouth opening is driven by the same clamped jaw actuator as the skin.
 */
export function SuuOralCavity({actuators,frontZ,enabled,lipSync}:Props){
 const root=useRef<THREE.Group>(null),cavity=useRef<THREE.Mesh>(null);
 const lower=useRef<THREE.Group>(null),tongue=useRef<THREE.Group>(null);
 useFrame(()=>{
  const jaw=Math.max(0,Math.min(1,actuators.current[0]||0));
  if(!root.current||!cavity.current||!lower.current||!tongue.current)return;
  const opening=Math.max(0,(jaw-.12)*.145);
  root.current.visible=enabled&&opening>.015;
  cavity.current.scale.set(.185,Math.max(.008,opening*.78),.013);
  cavity.current.position.y=-opening*.43;
  lower.current.position.y=-opening;
  tongue.current.position.y=-opening*.70;
  const shape=currentLipShape(lipSync);
  const raised=shape==="C"||shape==="I"||shape==="E";
  tongue.current.rotation.x=raised?-.26:.08;
  tongue.current.position.z=.012+(raised?.007:0);
  tongue.current.scale.x=shape==="O"||shape==="U"?.80:1;
 });
 return <group ref={root} position={[0,-.545,frontZ]} visible={false}>
   <mesh ref={cavity} position={[0,-.01,0]}>
    <sphereGeometry args={[1,28,14]}/>
    <meshStandardMaterial color="#081526" roughness={.93} side={THREE.DoubleSide}/>
   </mesh>
   <group position={[0,.012,.014]}>
    {teeth.map((tooth,i)=><mesh key={"upper-"+i} position={[tooth.x,0,tooth.z]}>
      <sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#d0e1ed" roughness={.46}/>
    </mesh>).map((el,i)=><group key={"u-"+i} scale={[teeth[i].width,.018,.019]}>{el}</group>)}
   </group>
   <group ref={lower} position={[0,0,.012]}>
    {teeth.map((tooth,i)=><group key={"l-"+i} position={[tooth.x,-.014,tooth.z]} scale={[tooth.width,.017,.019]}>
      <mesh><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#c5d7e4" roughness={.50}/></mesh>
    </group>)}
   </group>
   <group ref={tongue} position={[0,-.02,.017]}>
    <mesh scale={[.105,.025,.050]}>
      <sphereGeometry args={[1,20,12]}/>
      <meshStandardMaterial color="#96546c" roughness={.78}/>
    </mesh>
    <mesh position={[0,.012,.028]} scale={[.009,.005,.026]}>
      <sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#ad6a80" roughness={.8}/>
    </mesh>
   </group>
  </group>;
}
