export type FairAnnouncement = "welcome" | "goodbye";
export const FAIR_SCRIPTS: Record<FairAnnouncement, string> = {
  welcome: "¡Bienvenidos a la Expo Ciencias 2026! Soy SUU, su guía. Aquí encontrarán trabajos de estudiantes de educación básica y media sobre salud y bienestar, reciclaje, cuidado del medioambiente, energías renovables, astronomía y tecnología. Podrán conocer una maqueta de colegio sustentable con energía solar, el museo virtual Museo Vivo y exposiciones sobre telescopios y el universo. Si tienen preguntas, pueden conversar conmigo. ¡Disfruten el recorrido!",
  goodbye: "Hasta luego. Espero que hayan disfrutado de esta exposición de ciencias y tecnología.",
};

/** One announcement in flight. Activity expires; visitors never become a speech queue. */
export class FairFlow {
  private entry = -Infinity;
  private exit = -Infinity;
  private exitConsumed = -Infinity;
  private next = 0;
  private inFlight: FairAnnouncement | null = null;
  observe(now: number, entering: boolean, leaving: boolean) {
    if (entering) { this.entry = now; this.exit = -Infinity; }
    else if (leaving) this.exit = now;
  }
  poll(now: number, available: boolean): FairAnnouncement | null {
    if (!available || this.inFlight || now < this.next) return null;
    const entering = now - this.entry < 1400;
    const leaving = this.exit > this.exitConsumed && now - this.exit < 5000;
    const kind = entering ? "welcome" : leaving && now - this.entry > 3000 ? "goodbye" : null;
    if (kind) {
      this.inFlight = kind;
      this.exitConsumed = this.exit;
    }
    return kind;
  }
  complete(now: number) { this.inFlight = null; this.next = now + 1500; }
}

export type PersonBox = {x:number;y:number;width:number;height:number};
export type MotionSample = {x:number;y:number;size:number};
export class FairRecording {
  samples:MotionSample[]=[];
  multiple=0;
  add(boxes:PersonBox[]){
    if(boxes.length===1)this.samples.push(sampleBox(boxes[0]));
    else if(boxes.length>1)this.multiple++;
  }
  finish(){
    if(this.samples.length<6)throw new Error("No se captó suficiente recorrido. Comprueba que el recuadro siga a una persona y camina de un lado al otro.");
    if(this.multiple>(this.samples.length+this.multiple)*.3)throw new Error("Aparecieron varias personas. Repite este recorrido con una sola persona visible.");
    return this.samples;
  }
}
export type FairCalibration = {version:1;axis:keyof MotionSample;direction:1|-1;low:number;high:number};
export function sampleBox(b: PersonBox): MotionSample {return {x:b.x+b.width/2,y:b.y+b.height/2,size:Math.sqrt(b.width*b.height)};}
const median = (xs:number[]) => {const a=[...xs].sort((a,b)=>a-b);return a[Math.floor(a.length/2)] ?? 0;};
// Use short endpoint windows: waiting still must not dilute a brief crossing.
function ends(samples:MotionSample[],axis:keyof MotionSample){const n=2;return [median(samples.slice(0,n).map(s=>s[axis])),median(samples.slice(-n).map(s=>s[axis]))];}
export type FairExamples={entry:MotionSample[];exit:MotionSample[]};
export function validFairExamples(value:unknown):value is FairExamples {
 if(!value||typeof value!=="object")return false;
 return (["entry","exit"] as const).every(kind=>{
  const rows=(value as FairExamples)[kind];
  return Array.isArray(rows)&&rows.length<=120&&rows.every(s=>s&&[s.x,s.y,s.size].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1));
 });
}
export function calibrateFair(entry:MotionSample[],exit:MotionSample[]):FairCalibration {
  if(entry.length<6||exit.length<6)throw new Error("Camina por el paso con una sola persona visible durante al menos dos segundos.");
  const candidates=(["x","y","size"] as const).map(axis=>{
    const [a,b]=ends(entry,axis),[c,d]=ends(exit,axis);
    return {axis,a,b,c,d,score:(b-a)*(d-c)<0?Math.min(Math.abs(b-a),Math.abs(d-c)):0};
  }).sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  if(best.score<.08)throw new Error("Las trayectorias no se distinguen. Acerca la cámara al paso y repite entrada y salida en direcciones opuestas.");
  return {version:1,axis:best.axis,direction:best.b>best.a?1:-1,low:Math.min(best.a,best.b,best.c,best.d),high:Math.max(best.a,best.b,best.c,best.d)};
}
export function validCalibration(value:unknown):value is FairCalibration {
  if(!value||typeof value!=="object")return false;
  const c=value as FairCalibration;
  return c.version===1&&["x","y","size"].includes(c.axis)&&(c.direction===1||c.direction===-1)&&Number.isFinite(c.low)&&Number.isFinite(c.high)&&c.low>=0&&c.high<=1&&c.high-c.low>=.08;
}
type Track={box:PersonBox;history:{at:number;sample:MotionSample}[];seen:number};
/** Anonymous short-lived tracks. No identity, face template or saved camera frame. */
export class FairMotion {
  private tracks:Track[]=[];
  update(boxes:PersonBox[],now:number,calibration:FairCalibration|null) {
    const old=this.tracks.filter(t=>now-t.seen<1200),used=new Set<Track>();
    const tracks:Track[]=[];let entering=false,leaving=false;
    for(const box of boxes){
      const sample=sampleBox(box);
      const ranked=old.filter(t=>!used.has(t)).map(t=>({t,d:Math.hypot(sample.x-sampleBox(t.box).x,sample.y-sampleBox(t.box).y)+Math.abs(sample.size-sampleBox(t.box).size)})).sort((a,b)=>a.d-b.d);
      const match=ranked[0];
      const track=match&&match.d<.24?match.t:{box,history:[],seen:now};used.add(track);
      track.history=track.history.filter(s=>now-s.at<1000);track.history.push({at:now,sample});track.box=box;track.seen=now;tracks.push(track);
      const first=track.history[0];
      if(!calibration||now-first.at<500||track.history.length<3)continue;
      const axis=calibration.axis,v=sample[axis];
      if(v<calibration.low-.08||v>calibration.high+.08)continue;
      const delta=(v-first.sample[axis])*calibration.direction;
      const threshold=Math.max(.025,(calibration.high-calibration.low)*.09);
      if(delta>threshold)entering=true;
      if(delta< -threshold)leaving=true;
    }
    // Retain unmatched tracks briefly across missed detections; never emit their old activity.
    this.tracks=[...tracks,...old.filter(t=>!used.has(t))];
    return {entering,leaving};
  }
}
