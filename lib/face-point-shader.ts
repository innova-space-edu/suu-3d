import * as THREE from "three";

/** Point sprite renderer: round, crisp dots, depth-aware and NO additive blending / bloom. */
const vertex=`
attribute float aImportance;
uniform float uPixelSize;
uniform float uDpr;
uniform float uBrightness;
varying vec3 vColor;
varying float vFacing;
varying float vPower;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.0);
 gl_Position=projectionMatrix*mv;
 vec3 n=normalize(normalMatrix*vec3(0.0,0.0,1.0));
 float distanceScale=clamp(3.6/max(2.0,-mv.z),0.7,1.55);
 vPower=clamp(aImportance,1.0,3.2);
 gl_PointSize=clamp(uPixelSize*uDpr*distanceScale*(0.86+0.08*vPower),1.0,5.0);
 vColor=color*uBrightness;
 vFacing=distanceScale;
}
`;
const fragment=`
precision mediump float;
uniform float uOpacity;
varying vec3 vColor;
varying float vFacing;
varying float vPower;
void main(){
 float radius=length(gl_PointCoord-vec2(0.5));
 float disc=1.0-smoothstep(0.34,0.48,radius);
 if(disc<0.015) discard;
 // No luminous halo; preserve a visible dark gap between individual particles.
 float alpha=uOpacity*disc*(0.82+0.065*vPower)*clamp(vFacing,0.67,1.06);
 gl_FragColor=vec4(vColor,clamp(alpha,0.0,0.98));
}
`;
export function makeCleanPointMaterial(options:{size:number;brightness:number;opacity:number}){
 const dpr=typeof window==="undefined"?1:Math.min(1.8,window.devicePixelRatio||1);
 return new THREE.ShaderMaterial({
  vertexShader:vertex,fragmentShader:fragment,vertexColors:true,
  transparent:true,depthTest:true,depthWrite:false,
  blending:THREE.NormalBlending,side:THREE.FrontSide,
  uniforms:{uPixelSize:{value:options.size},uDpr:{value:dpr},uBrightness:{value:options.brightness},uOpacity:{value:options.opacity}}
 });
}
