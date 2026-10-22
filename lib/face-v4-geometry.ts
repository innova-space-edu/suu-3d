import * as THREE from "three";

export const MAX_FACE_POINTS=100000;
export type PointCount=25000|50000|100000;
export type FaceView="frente"|"izquierda"|"derecha";
export type CleanMode="puntos"|"contornos"|"superficie";
const sq=(v:number)=>v*v;
const gauss=(x:number,y:number,a:number,b:number,sx:number,sy:number)=>Math.exp(-.5*(sq((x-a)/sx)+sq((y-b)/sy)));
const clamp=(v:number)=>Math.max(0,Math.min(1,v));

/* Continuous parametric experimental head. This is NOT a professional scanned/rigged head. */
export function sculpt(x:number,y:number,z:number):[number,number,number]{
 const Y=y*1.22-.05,t=clamp((-Y-.4)/.77);
 let X=x*(.95+.065*gauss(Y,0,-.21,0,.26,1)-.2*Math.pow(t,2.2)),Z=z*.89;
 const ear=gauss(Math.abs(X),Y,.88,-.1,.13,.3)*clamp((Math.abs(X)-.67)/.18);
 X+=Math.sign(X)*.13*ear;
 let d=.06*gauss(X,Y,0,.63,.62,.35);
 for(const side of [-1,1]){
  d+=.085*gauss(X,Y,side*.38,.38,.23,.10);
  d-=.13*gauss(X,Y,side*.38,.165,.19,.12);
  d+=.11*gauss(X,Y,side*.52,-.20,.24,.21);
  d+=.115*gauss(X,Y,side*.16,-.41,.085,.084);
  d-=.045*gauss(X,Y,side*.115,-.467,.065,.041);
 }
 d+=.195*gauss(X,Y,0,.02,.115,.40)+.275*gauss(X,Y,0,-.345,.155,.125);
 d+=.064*gauss(X,Y,0,-.605,.245,.048)-.057*gauss(X,Y,0,-.653,.265,.023);
 d+=.087*gauss(X,Y,0,-.718,.247,.061)+.108*gauss(X,Y,0,-.96,.34,.2)-.043*gauss(X,Y,0,-.823,.22,.075);
 return [X,Y,Z+clamp(z*2.7)*d];
}
export function tone(x:number,y:number,z:number):[number,number,number]{
 // Darker blues, restrained white; pupils are shaded instead of overexposed.
 const illum=.42+.18*Math.max(0,z);
 let c:[number,number,number]=[.045+.13*illum,.19+.42*illum,.40+.43*illum];
 if(z<.38)return c;
 for(const cx of [-.38,.38]){
  const dx=(x-cx)/.205,h=.165+.025*(1-clamp(dx*dx)),r=Math.sqrt(Math.max(0,1-dx*dx))*.106;
  const p=sq(x-cx)+sq(y-.163);
  if(Math.abs(dx)<1&&Math.abs(y-h)<r)c=[.27,.63,.78];
  if(p<sq(.063))c=[.07,.32,.64];
  if(p<sq(.030))c=[.008,.03,.07];
  if(sq(x-cx+.020)+sq(y-.185)<sq(.008))c=[.53,.82,.91];
  if(Math.abs(dx)<1.02&&Math.abs(Math.abs(y-h)-r)<.008)c=[.21,.65,.84];
 }
 for(const cx of [-.12,.12])if(sq((x-cx)/.048)+sq((y+.457)/.027)<1)c=[.014,.06,.11];
 const span=Math.max(0,1-sq(x/.32)),ly=-.653+.029*span;
 if(Math.abs(x)<.33&&Math.abs(y-ly)<.010)c=[.012,.04,.085];
 else if((Math.abs(x)<.31&&Math.abs(y-(ly+.048*span))<.014)||(Math.abs(x)<.32&&Math.abs(y-(ly-.070*span))<.017))c=[.20,.48,.69];
 return c;
}
export function importanceAt(x:number,y:number,z:number){
 if(z<.38)return 1;
 let w=1;
 for(const cx of [-.38,.38]){
  w+=.9*gauss(x,y,cx,.165,.23,.145);
  w+=.32*gauss(x,y,cx,.40,.26,.07);
 }
 w+=1.0*gauss(x,y,0,-.31,.21,.35);
 w+=1.2*gauss(x,y,0,-.68,.37,.14);
 w+=.22*gauss(x,y,0,-.96,.4,.15);
 w+=.15*gauss(Math.abs(x),y,.80,-.12,.22,.39);
 return Math.min(3.2,w);
}
export type FaceGeometryBundle={surface:THREE.BufferGeometry;cloud:THREE.BufferGeometry;contours:THREE.BufferGeometry;contourCount:number;dispose:()=>void};
function makeContours(surface:THREE.BufferGeometry){
 // Project curve coordinates against the parametric frontal face in constant time.
 // Previous implementation raycast ~4,000 times against ~92,000 triangles, locking UI.
 const surfaceZ=(x:number,y:number):number|null=>{
  const rawY=(y+.05)/1.22,t=clamp((-y-.40)/.77);
  const width=.95+.065*gauss(y,0,-.21,0,.26,1)-.20*Math.pow(t,2.2);
  const rawX=x/width,rr=1-rawX*rawX-rawY*rawY;
  if(rr<=.035)return null;
  const z=sculpt(rawX,rawY,Math.sqrt(rr))[2];
  return z>.20?z:null;
 };
 const vertices:number[]=[],colors:number[]=[],weights:number[]=[];
 const put=(x:number,y:number,opacity=1)=>{
  const z=surfaceZ(x,y);if(z===null)return;
  vertices.push(x,y,z+.018);
  colors.push(.12*opacity,.49*opacity,.73*opacity);weights.push(1.38);
 };
 function path(n:number,fn:(t:number)=>[number,number],strength=1){
  for(let i=0;i<n;i++){const t=(i+.5)/n;const [x,y]=fn(t);put(x,y,strength)}
 }
 for(const cx of [-.38,.38]){
  for(const sign of [1,-1])path(380,t=>{
   const theta=t*Math.PI,dx=Math.cos(theta);
   return [cx+.203*dx,.164+sign*.103*Math.sin(theta)];
  },.97);
  path(260,t=>{const x=cx+(t-.5)*.51;return [x,.395+.048*Math.cos((t-.5)*Math.PI*1.6)]},.72);
 }
 // Curved, subtle nose bridge and alae.
 for(const side of [-1,1]){
  path(180,t=>[side*(.046+.068*t),.33-.69*t],.64);
  path(230,t=>[side*(.115+.057*Math.cos(Math.PI*t)),-.45+.038*Math.sin(Math.PI*t)],.7);
 }
 // Upper and lower vermilion boundaries: dotted curves, not solid geometry.
 for(const side of [-1,1]){
  path(400,t=>{
   const x=(t-.5)*.58,mid=-.652+.031*(1-Math.pow(x/.30,2));
   return [x,mid+side*(side>0?.036:.055)*Math.max(0,1-Math.pow(x/.31,2))];
  },.84);
 }
 // Jaw: curved guide points, low contrast.
 path(600,t=>{
  const x=(t-.5)*1.48,shape=Math.pow(Math.abs(x)/.74,1.56);
  return [x,-1.10+.51*shape];
 },.53);
 for(const sign of [-1,1]){
  path(260,t=>{
   const theta=t*Math.PI*2;
   return [sign*(.925+.076*Math.cos(theta)),-.13+.21*Math.sin(theta)];
  },.48);
 }
 const out=new THREE.BufferGeometry();
 out.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
 out.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
 out.setAttribute("aImportance",new THREE.Float32BufferAttribute(weights,1));
 return out;
}
export function createFaceGeometry():FaceGeometryBundle{
 // Keep initial main-thread work small. 100k particles are built in a Web Worker.
 const surface=new THREE.SphereGeometry(1,152,108);
 const p=surface.attributes.position,c=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const v=sculpt(p.getX(i),p.getY(i),p.getZ(i));p.setXYZ(i,...v);c.set(tone(...v),i*3);
 }
 p.needsUpdate=true;surface.computeVertexNormals();
 surface.setAttribute("color",new THREE.BufferAttribute(c,3));
 const cloud=new THREE.BufferGeometry();
 const position=new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS*3),3).setUsage(THREE.DynamicDrawUsage);
 const color=new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS*3),3).setUsage(THREE.DynamicDrawUsage);
 const weight=new THREE.BufferAttribute(new Float32Array(MAX_FACE_POINTS),1).setUsage(THREE.DynamicDrawUsage);
 cloud.setAttribute("position",position);cloud.setAttribute("color",color);cloud.setAttribute("aImportance",weight);
 cloud.setDrawRange(0,0);
 const contours=makeContours(surface);
 return {surface,cloud,contours,contourCount:contours.getAttribute("position").count,dispose:()=>{surface.dispose();cloud.dispose();contours.dispose()}};
}
