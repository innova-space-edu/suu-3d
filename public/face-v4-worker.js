"use strict";
/* Nonblocking face cloud. Local calculations, no external API or media access. */
const sq=(v)=>v*v;
const gauss=(x,y,a,b,sx,sy)=>Math.exp(-.5*(sq((x-a)/sx)+sq((y-b)/sy)));
const clamp=(v)=>Math.max(0,Math.min(1,v));

/* Continuous parametric experimental head. This is NOT a professional scanned/rigged head. */
function sculpt(x,y,z){
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
function tone(x,y,z){
 // Darker blues, restrained white; pupils are shaded instead of overexposed.
 const illum=.42+.18*Math.max(0,z);
 let c=[.045+.13*illum,.19+.42*illum,.40+.43*illum];
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
function importanceAt(x,y,z){
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

self.onmessage=({data})=>{
 if(data?.type!=="generate")return;
 try{
  const total=Math.min(100000,Math.max(0,Math.trunc(data.count||0))),CHUNK=5000;
  let seed=19871623;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  let written=0;
  while(written<total){
   const n=Math.min(CHUNK,total-written);
   const pos=new Float32Array(n*3),colors=new Float32Array(n*3),imp=new Float32Array(n);
   let k=0;
   while(k<n){
    const y=rng()*2-1,phi=rng()*Math.PI*2,r=Math.sqrt(Math.max(0,1-y*y));
    const x=Math.cos(phi)*r,z=Math.sin(phi)*r;
    const v=sculpt(x,y,z),w=importanceAt(...v);
    if(rng()*3.3>w)continue;
    const j=k*3,col=tone(...v);
    pos[j]=v[0]+x*.009;pos[j+1]=v[1]+y*.009;pos[j+2]=v[2]+z*.009;
    colors.set(col,j);imp[k]=w;k++;
   }
   self.postMessage({type:"chunk",offset:written,count:n,position:pos.buffer,color:colors.buffer,importance:imp.buffer},[pos.buffer,colors.buffer,imp.buffer]);
   written+=n;
  }
  self.postMessage({type:"complete",count:total});
 }catch(e){self.postMessage({type:"error",message:String(e?.message||e)})}
};
