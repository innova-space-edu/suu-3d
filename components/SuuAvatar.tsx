"use client";
import {Canvas,useFrame} from "@react-three/fiber";
import {OrbitControls,Stars} from "@react-three/drei";
import {useEffect,useMemo,useRef,useState} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import type {FaceMotion} from "@/hooks/useSuuFaceTracking";
type Props={speaking:boolean;listening:boolean;energy:number;quality:"eco"|"high";solid:boolean;tracking?:FaceMotion;cameraActive?:boolean};
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>Math.exp(-2*((x-cx)**2/(rx*rx)+(y-cy)**2/(ry*ry)));
/** Continuous anatomical surface: temporal narrowing, cheekbones, orbital depression, nose and jaw. */
function sculpt(x:number,y:number,z:number){
 const front=z>0, cheek=.92+.14*ellipse(x,y,0,-.2,.84,.65);
 const jaw=1-.28*Math.max(0,(-y-.24)/.8)**1.15;
 let X=x*cheek*jaw*(.95+.03*y),Y=y*1.19-.065,Z=z*.81;
 if(front){
  Z+=.20*ellipse(X,Y,-.56,-.19,.38,.4)+.20*ellipse(X,Y,.56,-.19,.38,.4);
  Z+=.055*ellipse(X,Y,0,.68,.85,.48); // forehead
  Z-=.15*ellipse(X,Y,-.39,.19,.25,.16)+.15*ellipse(X,Y,.39,.19,.25,.16);
  Z+=.22*ellipse(X,Y,0,-.16,.16,.39)+.21*ellipse(X,Y,0,-.39,.19,.18); // continuous nasal bridge and tip
  Z+=.12*ellipse(X,Y,-.18,-.43,.18,.11)+.12*ellipse(X,Y,.18,-.43,.18,.11);
  Z+=.095*ellipse(X,Y,0,-.67,.35,.16)+.13*ellipse(X,Y,0,-.98,.33,.18);
  Z+=.045*ellipse(X,Y,-.28,-.70,.31,.17)+.045*ellipse(X,Y,.28,-.70,.31,.17);
  Z-=.075*ellipse(X,Y,0,-.77,.25,.05);
 }
 return [X,Y,Z] as const;
}
const cyan="#74dff9";
function Surface({high,solid}:{high:boolean;solid:boolean}){
 const base=useMemo(()=>{
  const geo=new THREE.SphereGeometry(1,high?196:98,high?156:78),attr=geo.attributes.position;
  for(let i=0;i<attr.count;i++)attr.setXYZ(i,...sculpt(attr.getX(i),attr.getY(i),attr.getZ(i)));
  geo.computeVertexNormals();
  return geo;
 },[high]);
 const dots=useMemo(()=>{
  const count=high?64000:15500,positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,angle=i*2.399963229728653,rad=Math.sqrt(Math.max(0,1-y*y));
   const o=sculpt(Math.cos(angle)*rad,y,Math.sin(angle)*rad);
   positions.set(o,i*3);
   const f=.48+.4*Math.abs(Math.sin(i*.79));
   colors.set([.14+f*.23,.43+f*.28,.72+f*.28],i*3);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.BufferAttribute(positions,3));geo.setAttribute("color",new THREE.BufferAttribute(colors,3));return geo;
 },[high]);
 useEffect(()=>()=>{base.dispose();dots.dispose()},[base,dots]);
 return <>
  <mesh geometry={base}><meshPhysicalMaterial color={solid?"#77d6ed":"#1b85bd"} metalness={.24} roughness={.42} transparent opacity={solid?.86:.43} depthWrite={solid} side={THREE.FrontSide}/></mesh>
  <mesh geometry={base} scale={1.002}><meshBasicMaterial color="#46bee9" wireframe transparent opacity={high?.065:.082} depthWrite={false}/></mesh>
  <points geometry={dots}><pointsMaterial size={high?.009:.013} sizeAttenuation transparent vertexColors opacity={.89} depthWrite={false} blending={THREE.AdditiveBlending}/></points>
 </>;
}
function Line({points,r=.013,color=cyan,opacity=.8}:{points:[number,number,number][];r?:number;color?:string;opacity?:number}){
 const curve=useMemo(()=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),[points]);
 const geometry=useMemo(()=>new THREE.TubeGeometry(curve,32,r,7,false),[curve,r]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry}><meshBasicMaterial color={color} transparent opacity={opacity}/></mesh>;
}
function Eyeball({x,blink,look}:{x:number;blink:number;look:{x:number;y:number}}){
 const pivot=useRef<THREE.Group>(null);
 useFrame(()=>{if(pivot.current){pivot.current.rotation.y=THREE.MathUtils.lerp(pivot.current.rotation.y,look.x*.22,.19);pivot.current.rotation.x=THREE.MathUtils.lerp(pivot.current.rotation.x,-look.y*.13,.19)}});
 const z=.795;
 return <group position={[x,.165,z]}>
  <mesh scale={[.175,.112,.069]}><sphereGeometry args={[1,40,30]}/><meshPhysicalMaterial color="#92e2ee" roughness={.23} metalness={.16} transparent opacity={.95}/></mesh>
  <group ref={pivot}><mesh position={[0,-.005,.07]} scale={[.081,.082,.025]}><sphereGeometry args={[1,32,24]}/><meshBasicMaterial color="#2d7192"/></mesh><mesh position={[0,-.005,.091]} scale={[.043,.057,.018]}><sphereGeometry args={[1,24,20]}/><meshBasicMaterial color="#031324"/></mesh><mesh position={[-.022,.024,.108]} scale={[.012,.012,.005]}><sphereGeometry args={[1,12,8]}/><meshBasicMaterial color="#f2ffff"/></mesh></group>
  <group scale={[1,Math.max(.06,1-blink*.97),1]}>
   <Line points={[[-.19,.01,.015],[-.125,.11,.062],[0,.125,.072],[.12,.09,.055],[.19,.006,.02]]} r={.023}/>
   <Line points={[[-.19,.01,.015],[-.09,-.105,.05],[.055,-.115,.06],[.19,.006,.02]]} r={.019} opacity={.88}/>
  </group>
 </group>;
}
function FaceDetails({talk,blink,smile,look}:{talk:number;blink:number;smile:number;look:{x:number;y:number}}){
 const jaw=useRef<THREE.Group>(null),leftBrow=useRef<THREE.Group>(null),rightBrow=useRef<THREE.Group>(null);
 useFrame(()=>{if(jaw.current)jaw.current.position.y=THREE.MathUtils.lerp(jaw.current.position.y,-.09*talk,.18);if(leftBrow.current)leftBrow.current.position.y=.025*Math.sin(performance.now()*.0006)+.025*smile;if(rightBrow.current)rightBrow.current.position.y=.025*Math.sin(performance.now()*.0006)+.025*smile});
 const upper:[number,number,number][]=[[-.31,-.64,.813],[-.18,-.619,.88],[0,-.647,.94],[.18,-.619,.88],[.31,-.64,.813]];
 const lower:[number,number,number][]=[[-.31,-.64,.813],[-.17,-.713,.864],[0,-.752,.918],[.17,-.713,.864],[.31,-.64,.813]];
 return <group>
  {[-.41,.41].map(x=><Eyeball key={x} x={x} blink={blink} look={look}/>)}
  {[-1,1].map((side,i)=><group key={side} ref={i===0?leftBrow:rightBrow}><Line points={side<0?[[-.62,.385,.76],[-.51,.425,.794],[-.38,.441,.821],[-.24,.413,.805]]:[[.24,.413,.805],[.38,.441,.821],[.51,.425,.794],[.62,.385,.76]]} r={.032} color="#8eeeff" opacity={.85}/></group>)}
  <Line points={[[0,.385,.847],[0,.08,.954],[0,-.19,1.06],[0,-.365,1.138],[0,-.438,1.15]]} r={.035} color="#4fb8dd" opacity={.42}/>
  {[-1,1].map(s=><group key={s}>
   <mesh position={[s*.164,-.423,1.051]} rotation={[0,s*.35,0]} scale={[.108,.065,.078]}><sphereGeometry args={[1,24,18]}/><meshPhysicalMaterial color="#55c2e7" transparent opacity={.76}/></mesh>
   <mesh position={[s*.128,-.47,1.122]} scale={[.05,.022,.022]}><sphereGeometry args={[1,16,12]}/><meshBasicMaterial color="#123d5e"/></mesh>
   <Line points={[[s*.64,-.19,.77],[s*.56,-.37,.87],[s*.49,-.55,.86],[s*.35,-.64,.834]]} r={.012} color="#80e1fa" opacity={.3}/>
  </group>)}
  <mesh position={[0,-.69,.848]} scale={[.29,Math.max(.015,.026+talk*.36),.027]}><sphereGeometry args={[1,40,20]}/><meshBasicMaterial color="#031425"/></mesh>
  <Line points={upper} r={.023} color="#a6f4fd" opacity={.96}/>
  <group ref={jaw}><Line points={lower} r={.029} color="#79d6f1" opacity={.94}/></group>
  <mesh position={[0,-.846,.838]} scale={[.33,.09,.067]}><sphereGeometry args={[1,36,18]}/><meshPhysicalMaterial color="#2b97c4" transparent opacity={.23}/></mesh>
  <Line points={[[-.77,-.38,.57],[-.68,-.69,.67],[-.45,-.99,.77],[0,-1.19,.81],[.45,-.99,.77],[.68,-.69,.67],[.77,-.38,.57]]} r={.012} color="#86eaff" opacity={.38}/>
 </group>;
}
function Procedural({quality,solid,speaking,energy,look,blend}:{quality:"eco"|"high";solid:boolean;speaking:boolean;energy:number;look:{x:number;y:number};blend?:FaceMotion}){
 const t=useRef(0),blink=useRef(0);useFrame(({clock},dt)=>{const phase=clock.elapsedTime;const natural=Math.pow(Math.max(0,Math.sin(phase*.65+.7)),60);blink.current=THREE.MathUtils.damp(blink.current,Math.max(natural,blend?.blink||0),13,dt);t.current=THREE.MathUtils.damp(t.current,Math.max(speaking?.09+Math.max(.05,energy)*.8:0,blend?.mouth||0),9,dt)});
 return <group><Surface high={quality==="high"} solid={solid}/><FaceDetails talk={Math.max(speaking?.1+energy*.7:0,blend?.mouth||0)} blink={Math.max(blink.current,blend?.blink||0)} smile={blend?.smile||0} look={look}/></group>;
}
function External({url,speaking,energy,look,tracking,quality,solid}:{url:string;speaking:boolean;energy:number;look:{x:number;y:number};tracking?:FaceMotion;quality:"eco"|"high";solid:boolean}){
 const [scene,setScene]=useState<THREE.Group|null>(null);
 useEffect(()=>{let alive=true;const loader=new GLTFLoader();loader.load(url,g=>{if(alive)setScene(g.scene)},undefined,()=>{if(alive)setScene(null)});return()=>{alive=false}},[url]);
 useFrame(({clock})=>{if(!scene)return;const blink=Math.max(Math.pow(Math.max(0,Math.sin(clock.elapsedTime*.65+.7)),55),tracking?.blink||0);
 scene.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;const values:Record<string,number>={jawOpen:Math.max(speaking?energy:.02,tracking?.mouth||0),mouthOpen:Math.max(speaking?energy:.02,tracking?.mouth||0),mouthSmileLeft:tracking?.smile||0,mouthSmileRight:tracking?.smile||0,eyeBlinkLeft:blink,eyeBlinkRight:blink,eyeLookUpLeft:Math.max(0,look.y),eyeLookUpRight:Math.max(0,look.y),eyeLookDownLeft:Math.max(0,-look.y),eyeLookDownRight:Math.max(0,-look.y)};for(const [key,value]of Object.entries(values)){const i=mesh.morphTargetDictionary[key];if(i!==undefined)mesh.morphTargetInfluences[i]=THREE.MathUtils.lerp(mesh.morphTargetInfluences[i],value,.19)}})});
 return scene?<primitive object={scene}/>:<Procedural quality={quality} solid={solid} speaking={speaking} energy={energy} look={look} blend={tracking}/>;
}
function Scene({speaking,listening,energy,quality,solid,tracking,cameraActive}:Props){
 const head=useRef<THREE.Group>(null),gaze=useRef({x:0,y:0});const model=process.env.NEXT_PUBLIC_SUU_HEAD_MODEL;
 useFrame(({clock,pointer},dt)=>{const y=tracking&&cameraActive?tracking.yaw*.40:pointer.x*.17+Math.sin(clock.elapsedTime*.29)*.035;const x=tracking&&cameraActive?-tracking.pitch*.27:-pointer.y*.085;gaze.current.x=THREE.MathUtils.damp(gaze.current.x,tracking&&cameraActive?tracking.gazeX:pointer.x,6,dt);gaze.current.y=THREE.MathUtils.damp(gaze.current.y,tracking&&cameraActive?tracking.gazeY:pointer.y,6,dt);if(head.current){head.current.rotation.y=THREE.MathUtils.damp(head.current.rotation.y,y,5,dt);head.current.rotation.x=THREE.MathUtils.damp(head.current.rotation.x,x,5,dt);head.current.rotation.z=THREE.MathUtils.damp(head.current.rotation.z,cameraActive?(tracking?.roll||0)*-.2:0,5,dt);head.current.position.y=Math.sin(clock.elapsedTime*.9)*.018+(listening?.01:0)}});
 return <><color attach="background" args={["#020d1d"]}/><ambientLight intensity={1.7}/><pointLight position={[2,2.5,4]} color="#34d5ff" intensity={18}/><pointLight position={[-2,-.4,3]} color="#4b92ff" intensity={10}/><pointLight position={[0,0,-4]} color="#6abafb" intensity={8}/>
 <group ref={head}>{model?<External url={model} speaking={speaking} energy={energy} look={gaze.current} tracking={tracking} quality={quality} solid={solid}/>:<Procedural quality={quality} solid={solid} speaking={speaking} energy={energy} look={gaze.current} blend={tracking}/>}</group>
 <mesh position={[0,-1.60,0]} rotation={[-Math.PI/2,0,0]}><torusGeometry args={[.84,.013,8,112]}/><meshBasicMaterial color={speaking?"#c2ffff":"#2189bb"}/></mesh>
 <Stars radius={35} depth={30} count={quality==="eco"?250:700} factor={1.7} fade/><OrbitControls enablePan={false} enableDamping minDistance={2.45} maxDistance={6.1} maxPolarAngle={2.05} minPolarAngle={.98}/>
 </>;
}
export default function SuuAvatar(props:Props){return <div className="avatarHost"><Canvas dpr={[1,props.quality==="eco"?1.2:1.8]} gl={{antialias:props.quality==="high"}} camera={{position:[0,.04,3.25],fov:44}}><Scene {...props}/></Canvas><div className="scanOverlay" aria-hidden="true"/><span className="avatarSignature">SUU · 64K FACIAL POINT FIELD · ANATOMICAL SCULPT</span></div>}
