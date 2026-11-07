import type {FacePose} from "./face-rig";
export type SpeechWord={text:string;start:number;end:number};
export type SpeechCharacter={text:string;start:number;end:number};
export type SpeechPhone={phone:string;start:number;end:number};
export type LipCue={start:number;end:number;shape:string;pose:FacePose;phone?:string};
export const VISEMES:Record<string,FacePose>={A:{jaw:.85,wide:.08},E:{jaw:.48,wide:.43},I:{jaw:.30,wide:.56},O:{jaw:.65,pucker:.60},U:{jaw:.40,pucker:.78},MBP:{jaw:0,pucker:0,wide:0},FV:{jaw:.17,wide:.13},C:{jaw:.26,wide:.06},REST:{jaw:0,pucker:0,wide:0}};
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

// Provider-aligned character boundaries are temporal measurements. They are not
// phoneme boundaries: Spanish graphemes are still approximated as visemes.
export function buildCharacterLipCues(chars:SpeechCharacter[]):LipCue[]{
 const result:LipCue[]=[];
 for(const ch of chars.slice(0,2400)){
  if(!ch||typeof ch.text!=="string"||!Number.isFinite(ch.start)||!Number.isFinite(ch.end)||ch.start<0||ch.end<=ch.start)continue;
  const letter=ch.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(!/[a-zñ]/u.test(letter))continue;
  const shape=/[aeiou]/.test(letter)?letter.toUpperCase():/[mbp]/.test(letter)?"MBP":/[fv]/.test(letter)?"FV":"C";
  result.push({start:ch.start,end:ch.end,shape,pose:{...VISEMES[shape]}});
 }
 return result.sort((a,b)=>a.start-b.start);
}
export function lipCueAt(cues:LipCue[],time:number):LipCue|undefined{
 if(!Number.isFinite(time)||time<0)return undefined;
 let lo=0,hi=cues.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=time)lo=mid+1;else hi=mid}
 const cue=cues[lo-1];
 return cue&&time<cue.end?cue:undefined;
}


// An acoustic forced-aligner may supply actual time-stamped speech phones.
// Keep these cues separate from character/word estimates and never guess phones
// under the "phoneme" label when the aligner has not run.
export function phoneViseme(phone:string):string{
 const p=phone.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036fˈˌː0-9]/g,"");
 if(!p||/^(sil|spn|sp|pau|<eps>)$/.test(p))return "REST";
 if(/[aɑɐæ]/.test(p))return "A";
 if(/[eɛə]/.test(p))return "E";
 if(/[iɪj]/.test(p))return "I";
 if(/[oɔ]/.test(p))return "O";
 if(/[uʊw]/.test(p))return "U";
 if(/[mbpβ]/.test(p))return "MBP";
 if(/[fv]/.test(p))return "FV";
 return "C";
}
export function buildPhonemeLipCues(phones:SpeechPhone[]):LipCue[]{
 return phones.slice(0,2400).filter(p=>p&&typeof p.phone==="string"&&p.phone.length<=16&&Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.start>=0&&p.end>p.start&&p.end<180)
 .map(p=>({start:p.start,end:p.end,shape:phoneViseme(p.phone),phone:p.phone,pose:{...VISEMES[phoneViseme(p.phone)]}}))
 .sort((a,b)=>a.start-b.start);
}

export function lipPoseAt(cues:LipCue[],time:number):FacePose{
 return lipCueAt(cues,time)?.pose??{...VISEMES.REST,browUp:0};
}
