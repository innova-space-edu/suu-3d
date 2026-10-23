import * as THREE from "three";
// Three.js injects position, normal and color; redeclaring color breaks WebGL compilation.
const vertex=`
attribute float aImportance;
uniform float uPixelSize;
uniform float uDpr;
uniform float uBrightness;
uniform float uContours;
varying vec3 vColor;
varying float vPower;
#include <common>
#include <morphtarget_pars_vertex>
void main(){
 #include <morphinstance_vertex>
 #include <begin_vertex>
 #include <morphtarget_vertex>
 vec3 objectNormal=normal;
 #include <morphnormal_vertex>
 vec4 mv=modelViewMatrix*vec4(transformed,1.0);
 gl_Position=projectionMatrix*mv;
 vec3 n=normalize(normalMatrix*objectNormal);
 float diffuse=max(0.0,dot(n,normalize(vec3(-0.5,0.65,1.0))));
 float fill=max(0.0,dot(n,normalize(vec3(0.65,-0.15,1.0))));
 float relief=0.24+0.56*diffuse+0.20*fill;
 float edge=pow(1.0-abs(dot(n,normalize(-mv.xyz))),2.0);
 float distanceScale=clamp(3.6/max(2.0,-mv.z),0.7,1.55);
 vPower=clamp(aImportance,1.0,3.2);
 gl_PointSize=clamp(uPixelSize*uDpr*distanceScale,1.0,5.0);
 vColor=color*uBrightness*(relief+uContours*edge*.35);
}
`;
const fragment=`
precision mediump float;
uniform float uOpacity;
varying vec3 vColor;
varying float vPower;
void main(){
 float radius=length(gl_PointCoord-vec2(0.5));
 float disc=1.0-smoothstep(0.34,0.48,radius);
 if(disc<0.015) discard;
 gl_FragColor=vec4(vColor,uOpacity*disc);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
export function makeCleanPointMaterial(options:{size:number;brightness:number;opacity:number}){
 return new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,vertexColors:true,
 transparent:true,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,
 uniforms:{uPixelSize:{value:options.size},uDpr:{value:1},uBrightness:{value:options.brightness},uOpacity:{value:options.opacity},uContours:{value:1}}});
}
