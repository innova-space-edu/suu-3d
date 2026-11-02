export type FairAnnouncement = "welcome" | "goodbye";
export const FAIR_SCRIPTS: Record<FairAnnouncement, string> = {
  welcome: "¡Bienvenidos a la Expo Ciencias 2026 del Colegio Providencia de Antofagasta! Soy SUU, la asistente holográfica de Innova Space Education. Les acompañaré con un resumen de los trabajos que pueden conocer durante su visita.\nColegio Providencia sustentable presenta una maqueta con materiales reutilizados y un circuito de energía solar. Invita a imaginar cómo aprovechar la luz del Sol en nuestro establecimiento; su viabilidad requiere medir la generación y el consumo de energía.\nEn Arte reciclado encontrarán tortugas de cartón, laberintos y alcancías: ejemplos de cómo dar una segunda vida a los materiales mediante la creatividad.\nReutilización natural propone recuperar hojas usadas por una cara, clasificarlas y convertirlas en bloques para apuntes y borradores.\nMural decorativo transforma cartón y envases en una obra colectiva y presenta una experiencia de germinación de semillas.\nPulpo sustentable nos presenta a Octavio, el aliado del mar. Este personaje didáctico enseña sobre contaminación marina, separación de residuos y cuidado del océano.\nMuseo Vivo es un recorrido digital por la vida silvestre. Reúne imágenes e información sobre especies, sus hábitats y conservación, y permite explorar el museo mediante un código QR.\nProyecto ALMA explica cómo las antenas del observatorio de Chajnantor trabajan coordinadas para estudiar el universo y por qué el desierto de Atacama ofrece condiciones favorables para observarlo.\nLos trabajos sobre el telescopio y su impacto en Chile explican cómo lentes, espejos y antenas permiten observar el cielo. Presentan distintos instrumentos y la importancia de los observatorios chilenos.\nLa exposición sobre Adelina Gutiérrez Alonso rescata la trayectoria de esta astrónoma chilena y sus aportes al estudio y la medición de la luz de las estrellas.\nEl impacto ambiental del teléfono celular nos invita a conocer sus materias primas y los residuos electrónicos. Propone reflexionar sobre reparar, reutilizar y llevar los dispositivos a una recolección especializada.\nUso excesivo del celular aborda el equilibrio entre las pantallas, el descanso, la concentración y la convivencia, con propuestas de actividades sin pantalla.\nManejo de las emociones invita a reconocer lo que sentimos, hacer una pausa y conversar con una persona de confianza.\nSalud mental aborda el autocuidado, la organización del día, el descanso y la importancia de pedir apoyo cuando lo necesitamos.\nAlimentación saludable presenta propuestas de colaciones escolares y hábitos variados, considerando las necesidades y posibles alergias de cada persona.\nPrevención del consumo de drogas reúne información y propuestas educativas para tomar decisiones informadas, fortalecer la confianza y facilitar la búsqueda de apoyo.\nEn esta feria encontrarán maquetas, creaciones, investigaciones y propuestas educativas. No todos los trabajos presentan resultados medidos: observen los afiches para conocer qué realizó y qué propone cada equipo.\nLes invito a recorrer la exposición con curiosidad, observar cada trabajo y compartir lo que descubran. ¡Disfruten la Expo Ciencias!",
  goodbye: "Hasta luego. Espero que hayan disfrutado de esta exposición de ciencias y tecnología.",
};

/** One announcement in flight. Activity expires; visitors never become a speech queue. */
export class FairFlow {
  constructor(private readonly entriesOnly=false) {}
  private entry = -Infinity;
  private exit = -Infinity;
  private exitConsumed = -Infinity;
  private next = 0;
  private inFlight: FairAnnouncement | null = null;
  observe(now: number, entering: boolean, leaving: boolean) {
    if (entering) { this.entry = now; this.exit = -Infinity; }
    else if (leaving) {this.exit = now;if(this.entriesOnly)this.entry=-Infinity;}
  }
  poll(now: number, available: boolean): FairAnnouncement | null {
    if (!available || this.inFlight || now < this.next) return null;
    const entering = now - this.entry < 1400;
    const leaving = this.exit > this.exitConsumed && now - this.exit < 5000;
    const kind = entering ? "welcome" : !this.entriesOnly && leaving && now - this.entry > 3000 ? "goodbye" : null;
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
