import type {FacePose} from "./face-rig";

export type SuuEmotion="neutral"|"joy"|"curiosity"|"empathy"|"concern"|"confidence";
export type EmotionEstimate={emotion:SuuEmotion;confidence:number;pose:FacePose};
/** Conservative, deterministic text-affect cues. This is NOT a trained emotion classifier.
 * Never use the visitor's camera expression or inferred personal traits.
 */
const signatures:Record<Exclude<SuuEmotion,"neutral">,RegExp[]>={
 joy:[/\b(feliz|alegria|maravillos[oa]|fantastic[oa]|excelente|genial|felicidades|encantad[oa]|happy|wonderful|great)\b/gi,/\b(que bien|me alegra|muy bien|bien hecho)\b/gi],
 curiosity:[/\b(interesting|curious|curios[oa]|exploraremos|descubramos|investiguemos|interesante|sabias|descubrir)\b/gi,/\b(veamos por que|como funciona|te explico)\b/gi],
 empathy:[/\b(lamento|comprendo|entiendo|acompanarte|apoyarte|sorry|understand|siento mucho|dificil)\b/gi],
 concern:[/\b(cuidado|precaucion|riesgo|peligro|atencion|alerta|warning|danger|importante)\b/gi],
 confidence:[/\b(logramos|conseguimos|resuelto|solucionado|completado|exito|confirmed|success|funciona)\b/gi]
};
const expressions:Record<SuuEmotion,FacePose>={
 neutral:{},joy:{smile:.48,browUp:.08},curiosity:{browUp:.32,smile:.08},empathy:{browUp:.20,smile:.10},concern:{frown:.28,browDown:.14},confidence:{smile:.25,browUp:.16}
};
/** Avoid presenting negatives ("no estoy feliz") as the opposite expression. */
export function emotionForSpeech(input:string):EmotionEstimate{
 if(typeof input!=="string"||!input.trim())return {emotion:"neutral",confidence:0,pose:{}};
 const text=input.slice(0,4000).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const score=new Map<SuuEmotion,number>();
 for(const [emotion,patterns] of Object.entries(signatures) as [Exclude<SuuEmotion,"neutral">,RegExp[]][]){
  let points=0;
  for(const pattern of patterns){pattern.lastIndex=0;for(const found of text.matchAll(pattern)){
   const preceding=text.slice(Math.max(0,found.index-20),found.index);
   if(/\b(no|nunca|sin|not|never|ni)\s+(?:\w+\s+){0,2}$/.test(preceding))continue;
   points+=1;
  }}
  score.set(emotion,points);
 }
 const ranked=[...score].sort((a,b)=>b[1]-a[1]);
 if(!ranked.length||ranked[0][1]===0||ranked[0][1]===ranked[1]?.[1])return {emotion:"neutral",confidence:0,pose:{}};
 const [emotion,hits]=ranked[0];
 return {emotion,confidence:Math.min(.85,.46+.11*hits),pose:{...expressions[emotion]}};
}
