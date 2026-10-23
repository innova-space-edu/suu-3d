import type {FacePose} from "./face-rig";
export type SpeechWord={text:string;start:number;end:number};
export type LipCue={start:number;end:number;shape:string;pose:FacePose};
export const VISEMES:Record<string,FacePose>={A:{jaw:.55,wide:.08},E:{jaw:.25,wide:.43},I:{jaw:.14,wide:.56},O:{jaw:.35,pucker:.60},U:{jaw:.17,pucker:.78},MBP:{jaw:0,pucker:0,wide:0},FV:{jaw:.09,wide:.13},C:{jaw:.15,wide:.06},REST:{jaw:0,pucker:0,wide:0}};
export function wordTimings(raw:{text:string;offset:number;duration:number}[]):SpeechWord[]{
 return raw.filter(w=>w.text&&Number.isFinite(w.offset)&&Number.isFinite(w.duration)&&w.offset>=0&&w.duration>0).slice(0,1200).map(w=>({text:w.text,start:w.offset/1e7,end:(w.offset+w.duration)/1e7})).sort((a,b)=>a.start-b.start);
}
export function estimatedWords(text:string,duration:number):SpeechWord[]{
 const words=text.match(/[\p{L}\p{N}]+[,.!?;:]*/gu)||[];
 const weights=words.map(w=>Math.max(2,w.length)+(/[,.!?;:]$/.test(w)?3:0)),sum=weights.reduce((a,b)=>a+b,0);let t=0;
 if(!Number.isFinite(duration)||duration<=0||!sum)return [];
 return words.map((word,i)=>{const start=t;t+=duration*weights[i]/sum;return {text:word,start,end:t-((/[,.!?;:]$/.test(word)?Math.min(.18,(t-start)*.3):0))}});
}
/** Word windows are measured by the provider; letter-to-viseme positions inside them are estimates. */
export function buildLipCues(words:SpeechWord[]):LipCue[]{
 const result:LipCue[]=[];
 for(const word of words){
  if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<=word.start||typeof word.text!=="string")continue;
  const letters=word.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/qu(?=[ei])/g,'k').replace(/gu(?=[ei])/g,'g').replace(/h/g,'').match(/[a-zñ]/g)||[];
  const units=letters.map(c=>({shape:/[aeiou]/.test(c)?c.toUpperCase():/[mbp]/.test(c)?'MBP':/[fv]/.test(c)?'FV':'C',weight:/[aeiou]/.test(c)?1.4:.85}));
  const total=units.reduce((s,u)=>s+u.weight,0);let t=word.start;
  for(const u of units){const end=t+(word.end-word.start)*u.weight/total;result.push({start:t,end,shape:u.shape,pose:{...VISEMES[u.shape],browUp:word.text.length>6?.065:.025}});t=end}
 }
 return result.sort((a,b)=>a.start-b.start);
}
export function lipPoseAt(cues:LipCue[],time:number):FacePose{
 if(!Number.isFinite(time)||time<0)return {...VISEMES.REST,browUp:0};
 let lo=0,hi=cues.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=time)lo=mid+1;else hi=mid}
 const cue=cues[lo-1];
 if(!cue||time>=cue.end)return {...VISEMES.REST,browUp:0};
 return cue.pose;
}
