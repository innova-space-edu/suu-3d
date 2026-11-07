import {FACE_CHANNELS, type FaceChannel, type FacePose} from "./face-rig";

/** Semi-implicit mass-spring facial actuator, not a measured soft-tissue FEM model.
 * Each channel has an independently damped response and bounded activation.
 * Integrating at fixed substeps keeps the animation stable on slow devices.
 */
export type FaceDynamics={value:Float64Array;velocity:Float64Array};
const clamp=(n:number)=>Math.min(1,Math.max(0,Number.isFinite(n)?n:0));
export function makeFaceDynamics():FaceDynamics{
 return {value:new Float64Array(FACE_CHANNELS.length),velocity:new Float64Array(FACE_CHANNELS.length)};
}
export function constrainedPose(pose:FacePose):FacePose{
 const target={...pose};
 // Antagonistic lip muscles must not pull in opposite directions at once.
 const p=clamp(target.pucker??0),w=clamp(target.wide??0);
 target.pucker=Math.max(0,p-w*.75);
 target.wide=Math.max(0,w-p*.75);
 // Prevent contradictory happy/serious poses from crushing the mid-face.
 const smile=clamp(target.smile??0),frown=clamp(target.frown??0);
 target.smile=Math.max(0,smile-frown*.65);
 target.frown=Math.max(0,frown-smile*.65);
 return target;
}
function actuator(channel:FaceChannel,closing:boolean){
 if(channel==="jaw")return {mass:1.8,stiffness:closing?1300:1050,damping:1.03};
 if(channel==="pucker"||channel==="wide")return {mass:.65,stiffness:950,damping:1.05};
 if(channel==="blinkLeft"||channel==="blinkRight")return {mass:.50,stiffness:820,damping:1.10};
 if(channel.startsWith("look"))return {mass:.55,stiffness:460,damping:1.06};
 return {mass:1.15,stiffness:170,damping:1.10};
}
export function advanceFaceDynamics(state:FaceDynamics,pose:FacePose,dt:number):FaceDynamics{
 if(!Number.isFinite(dt)||dt<=0)return state;
 const targets=constrainedPose(pose),steps=Math.max(1,Math.ceil(Math.min(dt,.05)/(1/120)));
 const h=Math.min(dt,.05)/steps;
 for(let step=0;step<steps;step++){
  FACE_CHANNELS.forEach((channel,i)=>{
   const target=clamp(targets[channel]??0),old=state.value[i],a=actuator(channel,target<old);
   const drag=2*Math.sqrt(a.stiffness*a.mass)*a.damping;
   const force=a.stiffness*(target-old)-drag*state.velocity[i];
   state.velocity[i]+=force/a.mass*h;
   state.value[i]=Math.min(1,Math.max(0,old+state.velocity[i]*h));
   if((state.value[i]===0&&state.velocity[i]<0)||(state.value[i]===1&&state.velocity[i]>0))state.velocity[i]=0;
  });
 }
 return state;
}
export function faceDynamicsWeights(state:FaceDynamics){return FACE_CHANNELS.map((_,i)=>clamp(state.value[i]));}
