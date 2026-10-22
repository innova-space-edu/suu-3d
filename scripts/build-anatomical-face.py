"""Build SUU's head from the CC0 MakeHuman hm08 mesh, not an ellipsoid.
Usage: python scripts/build-anatomical-face.py /path/to/base.obj
Original asset: https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
"""
import sys, json, struct, hashlib
from pathlib import Path
import numpy as np
source=Path(sys.argv[1]); vertices=[]; faces=[]; group=''
expected='8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected: raise ValueError('Unexpected source mesh revision')
for line in source.read_text().splitlines():
    if line.startswith('v '): vertices.append(list(map(float,line.split()[1:4])))
    elif line.startswith('g '): group=line[2:]
    elif line.startswith('f ') and group=='body': faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
v=np.array(vertices); level=5.6; cuts={}; vv=v.tolist(); ff=[]
# Clip shoulders to a flat lower boundary while retaining connected head/neck topology.
for f in faces:
    poly=[]
    for a,b in zip(f,f[1:]+f[:1]):
        ina=v[a,1]>=level; inb=v[b,1]>=level
        if ina: poly.append(a)
        if ina!=inb:
            edge=tuple(sorted((a,b)))
            if edge not in cuts:
                t=(level-v[a,1])/(v[b,1]-v[a,1]); cuts[edge]=len(vv);vv.append((v[a]+t*(v[b]-v[a])).tolist())
            poly.append(cuts[edge])
    if len(poly)>=3: ff.append(poly)
used=sorted({i for f in ff for i in f}); remap={i:j for j,i in enumerate(used)}
v=np.array(vv)[used];f=[[remap[i] for i in p] for p in ff]
def subdivide(v,faces):
    fp=np.array([v[f].mean(0) for f in faces]);edges={}; vf=[[] for _ in v];ve=[[] for _ in v]
    for fi,f in enumerate(faces):
        for a,b in zip(f,f[1:]+f[:1]):edges.setdefault(tuple(sorted((a,b))),[]).append(fi)
        for a in f:vf[a].append(fi)
    edgekeys=list(edges);ei={e:i+len(v) for i,e in enumerate(edgekeys)}; ep=[]
    for e,fs in edges.items():
        a,b=e;ve[a].append(e);ve[b].append(e)
        ep.append((v[a]+v[b]+fp[fs].sum(0))/4 if len(fs)==2 else (v[a]+v[b])/2)
    out=v.copy()
    for i in range(len(v)):
        boundary=[e[0] if e[1]==i else e[1] for e in ve[i] if len(edges[e])==1]
        if len(boundary)==2:out[i]=(6*v[i]+v[boundary].sum(0))/8
        elif vf[i]:
            n=len(vf[i]);R=np.array([(v[a]+v[b])/2 for a,b in ve[i]]).mean(0)
            out[i]=(fp[vf[i]].mean(0)+2*R+(n-3)*v[i])/n
    offset=len(v)+len(ep);newfaces=[]
    for fi,f in enumerate(faces):
        for j,a in enumerate(f):newfaces.append([a,ei[tuple(sorted((a,f[(j+1)%len(f)])))],offset+fi,ei[tuple(sorted((f[j-1],a)))]])
    return np.concatenate([out,np.array(ep),fp]),newfaces
for _ in range(2):v,f=subdivide(v,f)
tri=[]
for q in f:
    for k in range(1,len(q)-1):tri.append([q[0],q[k],q[k+1]])
colors=np.tile([.025,.28,.78],(len(v),1));parts=[v];colorparts=[colors];indices=[np.array(tri)];offset=len(v)
# Separate spherical eyeballs sit inside the existing anatomical eyelid openings.
for side in [-1,1]:
    ev=[];ec=[];et=[];rows=48;cols=96
    for j in range(rows+1):
        t=np.pi*j/rows
        for k in range(cols+1):
            a=2*np.pi*k/cols;r=.139
            x=r*np.sin(t)*np.cos(a);y=r*np.sin(t)*np.sin(a);z=r*np.cos(t)
            ev.append([side*.30775+x,7.28415+y,1.24535+z])
            radius=np.hypot(x,y)
            c=[.12,.34,.49]
            if z>0 and radius<.072:
                detail=.7+.3*np.sin(a*34)**2;c=[.015,.34*detail,.95*detail]
            if z>0 and radius<.031:c=[.001,.004,.009]
            ec.append(c)
    for j in range(rows):
        for k in range(cols):
            a=j*(cols+1)+k;b=a+cols+1;et.extend([[a,b,a+1],[a+1,b,b+1]])
    parts.append(np.array(ev));colorparts.append(np.array(ec));indices.append(np.array(et)+offset);offset+=len(ev)
v=np.concatenate(parts);c=np.concatenate(colorparts);idx=np.concatenate(indices)
v=(v-np.array([0,7.18,.53]))*.96
# Mesh dimensions remain anatomical; no procedural nose, lip or jaw bumps.
n=np.zeros_like(v);cross=np.cross(v[idx[:,1]]-v[idx[:,0]],v[idx[:,2]]-v[idx[:,0]])
for k in range(3):np.add.at(n,idx[:,k],cross)
n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
arrays=[v.astype('<f4'),n.astype('<f4'),c.astype('<f4'),idx.astype('<u4').flatten()];blob=b'';views=[];accessors=[]
for i,a in enumerate(arrays):
    views.append(dict(buffer=0,byteOffset=len(blob),byteLength=a.nbytes,target=34963 if i==3 else 34962));blob+=a.tobytes()
    acc=dict(bufferView=i,componentType=5125 if i==3 else 5126,count=len(a),type='SCALAR' if i==3 else 'VEC3')
    if i==0:acc.update(min=a.min(0).tolist(),max=a.max(0).tolist())
    accessors.append(acc)
doc=dict(asset=dict(version='2.0',generator='SUU anatomical head build; MakeHuman hm08 CC0'),scene=0,scenes=[dict(nodes=[0])],nodes=[dict(mesh=0)],meshes=[dict(primitives=[dict(attributes=dict(POSITION=0,NORMAL=1,COLOR_0=2),indices=3)])],buffers=[dict(byteLength=len(blob))],bufferViews=views,accessors=accessors)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<III',0x46546c67,2,28+len(j)+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob
Path('public/models/suu-face-anatomical.glb').write_bytes(out)
print(json.dumps(dict(vertices=len(v),triangles=len(idx),bytes=len(out),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),bounds=[v.min(0).tolist(),v.max(0).tolist()])))
