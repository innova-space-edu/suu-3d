"use strict";
// Area-weighted barycentric samples of the actual GLB, never a second procedural head.
self.onmessage=({data})=>{
 if(data?.type!=="generate")return;
 try{
  const p=new Float32Array(data.position),normals=new Float32Array(data.normal),indices=new Uint32Array(data.index),sourceColor=data.color?new Float32Array(data.color):null;
  if(!p.length||p.length!==normals.length||indices.length%3)throw new Error("Malla facial inválida");
  const triangles=indices.length/3,cdf=new Float64Array(triangles);
  const gauss=(x,y,cx,cy,sx,sy)=>Math.exp(-.5*(((x-cx)/sx)**2+((y-cy)/sy)**2));
  const importance=(x,y,z)=>z<.4?1:1+.25*gauss(x,y,0,-.3,.22,.35)+.25*gauss(x,y,0,-.66,.36,.14)+.2*(gauss(x,y,-.38,.16,.23,.14)+gauss(x,y,.38,.16,.23,.14));
  let sum=0;
  for(let t=0;t<triangles;t++){
   const a=indices[t*3]*3,b=indices[t*3+1]*3,c=indices[t*3+2]*3;
   const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
   const area=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2;
   sum+=area*importance((p[a]+p[b]+p[c])/3,(p[a+1]+p[b+1]+p[c+1])/3,(p[a+2]+p[b+2]+p[c+2])/3);cdf[t]=sum;
  }
  if(!(sum>0&&Number.isFinite(sum)))throw new Error("Superficie facial vacía");
  const total=Math.min(100000,Math.max(0,Math.trunc(data.count||0))),CHUNK=5000;
  let written=0;
  const halton=(i,base)=>{let f=1,r=0;while(i>0){f/=base;r+=f*(i%base);i=Math.floor(i/base)}return r};
  while(written<total){
   const count=Math.min(CHUNK,total-written),pos=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),imp=new Float32Array(count);
   for(let k=0;k<count;k++){
    // Area sampling decouples brightness from the mesh's dense eye/lip topology.
    const ordinal=written+k+1;
    const pick=halton(ordinal,2)*sum;let lo=0,hi=triangles-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]<=pick)lo=mid+1;else hi=mid}
    const a=indices[lo*3]*3,b=indices[lo*3+1]*3,c=indices[lo*3+2]*3;
    const s=Math.sqrt(halton(ordinal,3)),u=1-s,v=s*(1-halton(ordinal,5)),w=1-u-v,j=k*3;
    let nx=u*normals[a]+v*normals[b]+w*normals[c],ny=u*normals[a+1]+v*normals[b+1]+w*normals[c+1],nz=u*normals[a+2]+v*normals[b+2]+w*normals[c+2];
    const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
    const x=u*p[a]+v*p[b]+w*p[c],y=u*p[a+1]+v*p[b+1]+w*p[c+1],z=u*p[a+2]+v*p[b+2]+w*p[c+2];
    pos.set([x+nx*.004,y+ny*.004,z+nz*.004],j);normal.set([nx,ny,nz],j);
    for(let d=0;d<3;d++)color[j+d]=sourceColor?u*sourceColor[a+d]+v*sourceColor[b+d]+w*sourceColor[c+d]:[.19,.67,.88][d];imp[k]=importance(x,y,z);
   }
   self.postMessage({type:"chunk",offset:written,count,position:pos.buffer,normal:normal.buffer,color:color.buffer,importance:imp.buffer},[pos.buffer,normal.buffer,color.buffer,imp.buffer]);written+=count;
  }
  self.postMessage({type:"complete",count:total});
 }catch(e){self.postMessage({type:"error",message:String(e?.message||e)})}
};
