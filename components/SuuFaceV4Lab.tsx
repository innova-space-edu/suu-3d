"use client";
import {Canvas,useFrame} from "@react-three/fiber";
import {OrbitControls,Stars} from "@react-three/drei";
import {MeshSurfaceSampler} from "three/addons/math/MeshSurfaceSampler.js";
import {useEffect,useMemo,useRef,useState} from "react";
import * as THREE from "three";
const TOTAL=100000;
type View="frente"|"izquierda"|"derecha";
type Count=25000|50000|100000;
const g=(x:number,y:number,a:number,b:number,sx:number,sy:number)=>Math.exp(-.5*(Math.pow((x-a)/sx,2)+Math.pow((y-b)/sy,2)));
const sq=(x:number)=>x*x;
function sculpt(x:number,y:number,z:number):[number,number,number]{
 const Y=y*1.22-.05,t=Math.min(1,Math.max(0,(-Y-.40)/.77));
 let X=x*(.95+.065*g(Y,0,-.21,0,.26,1)-.20*Math.pow(t,2.2)),Z=z*.89;
 const e=g(Math.abs(X),Y,.88,-.10,.13,.30)*Math.min(1,Math.max(0,(Math.abs(X)-.67)/.18));
 X+=Math.sign(X)*.13*e;
 let d=.06*g(X,Y,0,.63,.62,.35);
 for(const s of [-1,1]){d+=.085*g(X,Y,s*.38,.38,.23,.10)-.13*g(X,Y,s*.38,.165,.19,.12)+.11*g(X,Y,s*.52,-.20,.24,.21)+.115*g(X,Y,s*.16,-.41,.085,.084)-.045*g(X,Y,s*.115,-.467,.065,.041)}
 d+=.195*g(X,Y,0,.02,.115,.40)+.275*g(X,Y,0,-.345,.155,.125)+.064*g(X,Y,0,-.605,.245,.048)-.057*g(X,Y,0,-.653,.265,.023)+.087*g(X,Y,0,-.718,.247,.061)+.108*g(X,Y,0,-.960,.34,.20)-.043*g(X,Y,0,-.823,.22,.075);
 return [X,Y,Z+Math.max(0,Math.min(1,z*2.7))*d];
}
function colorAt(x:number,y:number,z:number):[number,number,number]{
 const a=.45+.21*Math.max(0,z);let c:[number,number,number]=[.045+.21*a,.23+.62*a,.46+.49*a];
 if(z<.38)return c;
 for(const cx of [-.38,.38]){
  const dx=(x-cx)/.205,h=.165+.025*(1-Math.min(1,dx*dx)),r=Math.sqrt(Math.max(0,1-dx*dx))*.106,p=sq(x-cx)+sq(y-.163);
  if(Math.abs(dx)<1&&Math.abs(y-h)<r)c=[.4,.77,.84];
  if(p<sq(.063))c=[.06,.47,.88];
  if(p<sq(.030))c=[.012,.063,.14];
  if(sq(x-cx+.020)+sq(y-.185)<sq(.008))c=[.85,.99,1];
  if(Math.abs(dx)<1.02&&Math.abs(Math.abs(y-h)-r)<.008)c=[.29,.9,1];
  if(Math.abs(dx)<1.22&&Math.abs(y-(.387+.038*(1-dx*dx)))<.022)c=[.20,.69,.88];
 }
 for(const cx of [-.12,.12])if(sq((x-cx)/.048)+sq((y+.457)/.027)<1)c=[.02,.10,.16];
 const span=Math.max(0,1-sq(x/.32)),ly=-.653+.029*span;
 if(Math.abs(x)<.33&&Math.abs(y-ly)<.010)c=[.02,.09,.18];
 else if((Math.abs(x)<.31&&Math.abs(y-(ly+.048*span))<.014)||(Math.abs(x)<.32&&Math.abs(y-(ly-.070*span))<.017))c=[.22,.68,.94];
 return c;
}
function create(){
 const face=new THREE.SphereGeometry(1,320,220),p=face.attributes.position,colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const v=sculpt(p.getX(i),p.getY(i),p.getZ(i));p.setXYZ(i,...v);colors.set(colorAt(...v),i*3)}
 face.setAttribute("color",new THREE.BufferAttribute(colors,3));face.computeVertexNormals();
 const cloud=new THREE.BufferGeometry(),pos=new Float32Array(TOTAL*3),col=new Float32Array(TOTAL*3);
 
 const mat=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(face,mat);
 const sampler=new MeshSurfaceSampler(mesh).build(),sample=new THREE.Vector3();
 for(let i=0;i<TOTAL;i++){sampler.sample(sample);pos.set(sample.toArray(),i*3);col.set(colorAt(sample.x,sample.y,sample.z),i*3)}
 mat.dispose();cloud.setAttribute("position",new THREE.BufferAttribute(pos,3));cloud.setAttribute("color",new THREE.BufferAttribute(col,3));
 return {face,cloud};
}
function Head({view,count,solid}:{view:View;count:Count;solid:boolean}){
 const group=useRef<THREE.Group>(null);
 const {face,cloud}=useMemo(create,[]);
 useEffect(()=>()=>{face.dispose();cloud.dispose()},[face,cloud]);
 useEffect(()=>{cloud.setDrawRange(0,count)},[cloud,count]);
 useFrame((_,dt)=>{if(group.current)group.current.rotation.y=THREE.MathUtils.damp(group.current.rotation.y,view==="frente"?0:view==="izquierda"?-Math.PI/2:Math.PI/2,4,dt)});
 return <group ref={group}>
  <mesh geometry={face}><meshPhysicalMaterial vertexColors color="#ffffff" roughness={.6} transparent opacity={solid?.95:.51} depthWrite={solid}/></mesh>
  <points geometry={cloud}><pointsMaterial vertexColors size={count===100000?.010:.013} transparent sizeAttenuation opacity={.92} depthWrite={false} blending={THREE.AdditiveBlending}/></points>
 </group>;
}
export default function SuuFaceV4Lab(){
 const [view,setView]=useState<View>("frente"),[count,setCount]=useState<Count>(100000),[solid,setSolid]=useState(false);
 return <main className="faceLab">
  <header className="labHeader"><div><a href="/">← Volver a SUU</a><h1>SUU V4 · Laboratorio facial</h1><p>Superficie facial continua con 100.000 partículas independientes del modelo anterior.</p></div><span>EXPERIMENTAL · NO REEMPLAZA A SUU</span></header>
  <section className="labViewport"><Canvas camera={{position:[0,.02,3.6],fov:43}} dpr={[1,1.65]} gl={{antialias:true}}>
   <color attach="background" args={["#020d1e"]}/><ambientLight intensity={1.3}/><directionalLight position={[2,3,4]} intensity={1.4}/><pointLight position={[-3,-1,4]} color="#359fff" intensity={8}/>
   <Head view={view} count={count} solid={solid}/><Stars count={120} depth={20} factor={1.6}/><OrbitControls minDistance={2.6} maxDistance={6.0} enablePan={false}/>
  </Canvas><span className="labCount">{count.toLocaleString("es-CL")} puntos · vista {view}</span></section>
  <section className="labControls"><div><strong>Vista</strong><div className="labButtons">{(["frente","izquierda","derecha"] as View[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v==="frente"?"Frontal":v==="izquierda"?"Perfil izquierdo":"Perfil derecho"}</button>)}</div></div>
   <div><strong>Resolución</strong><div className="labButtons">{([25000,50000,100000] as Count[]).map(v=><button key={v} aria-pressed={count===v} onClick={()=>setCount(v)}>{v.toLocaleString("es-CL")}</button>)}</div></div>
   <label className="labCheck"><input type="checkbox" checked={solid} onChange={e=>setSolid(e.target.checked)}/> Ver malla sólida</label></section>
  <p className="labNote">Prototipo de investigación. Las imágenes son referencias visuales, no mediciones anatómicas. El modelo aún requiere escultura especializada, retopología y rig facial antes de reemplazar la versión de producción.</p>
 </main>;
}