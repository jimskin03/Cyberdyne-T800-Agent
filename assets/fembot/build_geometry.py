"""Rebuild Fembot's portable mesh source and GLB. Python standard library only.

Geometry is authored in the existing createBot joint coordinates (+Y up, +Z front).
This is a rigid articulated skin: the host owns every animation and physics joint.
Pivot nodes stay named aixiin_<joint> so the existing mesh contract still attaches.
Run tools/render-fembot.py inside Blender to make the editable studio scene.
"""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'characters' / 'fembot'
OUT.mkdir(parents=True, exist_ok=True)
PI = math.pi
sin, cos = math.sin, math.cos
MATERIALS = {
    'skin': {'color': [0.64, 0.32, 0.23], 'roughness': .46, 'metallic': 0},
    'lip': {'color': [.38, .055, .075], 'roughness': .32, 'metallic': 0},
    'chrome': {'color': [.55, .63, .73], 'roughness': .22, 'metallic': .92},
    'edge': {'color': [.16, .21, .28], 'roughness': .27, 'metallic': .85},
    'leather': {'color': [.012, .018, .027], 'roughness': .38, 'metallic': .18},
    'rubber': {'color': [.008, .011, .018], 'roughness': .68, 'metallic': .05},
    'hair': {'color': [.19, .095, .039], 'roughness': .4, 'metallic': .05},
    'gold': {'color': [.47, .27, .105], 'roughness': .38, 'metallic': .13},
    'highlight': {'color': [.7, .45, .22], 'roughness': .32, 'metallic': .1},
    'cyan': {'color': [.01, .55, .8], 'roughness': .23, 'metallic': .35, 'emissive': [.01, .65, 1]},
    'white': {'color': [.78, .83, .81], 'roughness': .28, 'metallic': 0},
    'iris': {'color': [.035, .18, .19], 'roughness': .2, 'metallic': .1},
    'black': {'color': [.004, .006, .01], 'roughness': .3, 'metallic': 0},
}
# Head y is the fembot neck length. createBot keeps the longer T-800 neck at
# y=.78; attachFembot copies this translation onto the host while the skin is on.
RIG = {
    'body': [None, [0, 0, 0]], 'torso': ['body', [0, 2.05, 0]],
    'neck': ['torso', [0, .55, .02]], 'head': ['neck', [0, .50, .05]],
    'jaw': ['head', [0, -.18, .12]],
}
for s, side in [(-1, 'L'), (1, 'R')]:
    RIG.update({f'sh{side}': ['torso', [s*.72, .5, 0]],
                f'fa{side}': [f'sh{side}', [0, -.8, 0]],
                f'hand{side}': [f'fa{side}', [0, -.82, 0]],
                f'hip{side}': ['body', [s*.32, 1.3, .05]],
                f'knee{side}': [f'hip{side}', [0, -1, 0]],
                f'foot{side}': [f'knee{side}', [0, -1.1, 0]]})
meshes = []

def mesh(name, joint, mat, verts, faces):
    meshes.append({'name': name, 'joint': joint, 'material': mat,
                   'vertices': [[round(v, 6) for v in p] for p in verts], 'faces': faces})

def surface(name, joint, mat, rows, cols, fn, wrap=False):
    vs = [fn(i/rows, j/cols) for i in range(rows+1) for j in range(cols+1)]
    fs = []
    for i in range(rows):
        for j in range(cols):
            a=i*(cols+1)+j; b=a+cols+1
            fs.extend([[a,a+1,b],[a+1,b+1,b]])
    mesh(name,joint,mat,vs,fs)

def ell(name,joint,mat,p,r,seg=28,rings=18):
    # Clockwise latitude ordering gives outward-facing triangles.
    surface(name,joint,mat,rings,seg,lambda u,v:[p[0]+r[0]*sin(PI*u)*cos(2*PI*v),p[1]+r[1]*cos(PI*u),p[2]+r[2]*sin(PI*u)*sin(2*PI*v)])

def tube(name,joint,mat,points,radius=.02,sides=8):
    vs=[]; fs=[]
    for i,p in enumerate(points):
        a=points[max(0,i-1)]; b=points[min(len(points)-1,i+1)]
        d=[b[k]-a[k] for k in range(3)]; length=math.sqrt(sum(x*x for x in d)) or 1
        d=[x/length for x in d]; up=[0,0,1] if abs(d[2])<.9 else [0,1,0]
        x=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]]
        norm=math.sqrt(sum(q*q for q in x)); x=[q/norm for q in x]
        y=[d[1]*x[2]-d[2]*x[1],d[2]*x[0]-d[0]*x[2],d[0]*x[1]-d[1]*x[0]]
        rr=radius if isinstance(radius,(int,float)) else radius[i]
        for j in range(sides):
            t=2*PI*j/sides; vs.append([p[k]+rr*(x[k]*cos(t)+y[k]*sin(t)) for k in range(3)])
        if i:
            for j in range(sides):
                a=(i-1)*sides+j; b=(i-1)*sides+(j+1)%sides; c=i*sides+j; d=i*sides+(j+1)%sides
                fs.extend([[a,b,c],[b,d,c]])
    fs.extend([[0,j+1,j] for j in range(1,sides-1)])
    last=(len(points)-1)*sides
    fs.extend([[last,last+j,last+j+1] for j in range(1,sides-1)])
    mesh(name,joint,mat,vs,fs)

def curve(name,joint,mat,control,r=.015,n=24,sides=8):
    # Catmull-Rom interpolation through authored control points.
    pts=[]
    for i in range(n+1):
        t=i/n*(len(control)-1); k=min(len(control)-2,int(t)); f=t-k
        p0=control[max(0,k-1)];p1=control[k];p2=control[k+1];p3=control[min(len(control)-1,k+2)]
        pts.append([.5*((2*p1[a])+(-p0[a]+p2[a])*f+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*f*f+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*f*f*f) for a in range(3)])
    tube(name,joint,mat,pts,r,sides)

def shell(name,joint,mat,levels,start=-PI,end=PI,seg=48):
    # (height, x radius, z radius, z centre). Open sections form jacket panels.
    vs=[];fs=[]
    for y,rx,rz,zc in levels:
        for j in range(seg+1):
            a=start+(end-start)*j/seg; vs.append([rx*sin(a),y,zc+rz*cos(a)])
    for i in range(len(levels)-1):
        for j in range(seg):
            a=i*(seg+1)+j;b=a+seg+1
            fs.extend([[a,a+1,b],[a+1,b+1,b]])
    mesh(name,joint,mat,vs,fs)

# A continuous shaped face, with a subtly modeled bridge and nose.
profile=[(-.35,.07,.15,.03),(-.31,.16,.21,.02),(-.23,.25,.25,0),(-.12,.30,.285,0),(.02,.34,.31,0),(.16,.345,.31,-.005),(.30,.33,.30,-.025),(.43,.30,.27,-.045),(.53,.235,.22,-.04),(.59,.10,.12,-.03),(.61,.005,.005,-.02)]
def face(u,v):
    t=u*(len(profile)-1);k=min(len(profile)-2,int(t)); f=t-k
    y,rx,rz,zc=[profile[k][a]*(1-f)+profile[k+1][a]*f for a in range(4)]
    a=(v*2-1)*PI; x=rx*sin(a); z=zc+rz*cos(a)
    front=max(0,cos(a))**12
    z+=front*(.105*math.exp(-(x/.055)**2-((y+.015)/.11)**2)+.035*math.exp(-(x/.065)**2-((y-.14)/.16)**2))
    return [x,y,z]
surface('Face', 'head','skin',64,72,face)
for s in [-1,1]:
    ell('Ear','head','skin',[s*.337,.025,-.012],[.057,.105,.065],20,16)
    ell('Ear implant','head','chrome',[s*.37,-.03,.025],[.026,.05,.04],16,12)
    ell('Ear diode','head','cyan',[s*.383,-.03,.055],[.012,.021,.009],12,8)
    # Almond eye surface with its outer corner raised slightly.
    ex=s*.148
    surface('Eye white','head','white',12,28,lambda u,v,s=s,ex=ex:[ex+(v*2-1)*.103,.145+.012*s*(v*2-1)+sin(PI*v)*(.05*(1-u)-.037*u),.298+.029*sin(PI*v)*sin(PI*u)])
    ell('Iris','head','iris',[ex,.147,.325],[.041,.041,.009],24,16)
    ell('Pupil','head','black',[ex,.147,.334],[.02,.024,.005],20,12)
    ell('Catchlight','head','white',[ex-.012,.162,.339],[.009,.009,.003],12,8)
    curve('Upper lash','head','black',[[ex-.103,.145-s*.012,.3],[ex-.048,.187,.321],[ex+.035,.19,.322],[ex+.103,.145+s*.012,.3]],.0085)
    curve('Lower eyelid','head','skin',[[ex-.103,.145-s*.012,.3],[ex,.109,.315],[ex+.103,.145+s*.012,.3]],.006)
    curve('Brow','head','hair',[[s*.055,.259,.303],[s*.14,.283,.303],[s*.23,.266,.278],[s*.265,.244,.256]],.017)
    ell('Nostril','head','lip',[s*.035,-.045,.385],[.014,.007,.007],12,8)
# Warm, slightly open smile; small teeth ribbon, separate lower lip follows jaw.
curve('Mouth shadow','head','lip',[[-.16,-.12,.265],[-.09,-.16,.292],[0,-.173,.31],[.09,-.16,.292],[.16,-.12,.265]],.014)
curve('Smile','head','white',[[-.125,-.143,.29],[0,-.167,.316],[.125,-.143,.29]],.009)
curve('Upper lip','head','lip',[[-.15,-.12,.278],[-.05,-.133,.32],[0,-.14,.328],[.05,-.133,.32],[.15,-.12,.278]],.012)
curve('Lower lip','jaw','lip',[[-.135,.027,.165],[0,-.013,.2],[.135,.027,.165]],.017)
# Hair cap leaves the face open; layered swept strands collect at the crown.
surface('Hair foundation','head','hair',26,48,lambda u,v:[.365*sin(.05+u*(1.55+.95*(1-max(0,cos(v*2*PI)))))*sin(v*2*PI),.10+.54*cos(.05+u*(1.55+.95*(1-max(0,cos(v*2*PI))))),-.04+.33*sin(.05+u*(1.55+.95*(1-max(0,cos(v*2*PI)))))*cos(v*2*PI)])
ell('Updo','head','hair',[.035,.64,-.16],[.265,.235,.245])
for i in range(22):
    a=2*PI*i/22
    curve('Updo ribbon','head','gold' if i%3 else 'highlight',[[.035+.25*cos(a),.64+.15*sin(a),-.15],[.02+.24*cos(a+.7),.70+.19*sin(a+.7),-.28],[.02+.12*cos(a+1.4),.79,-.18]],.022,18)
for s in [-1,1]:
    for i in range(13):
        k=i/12
        curve('Swept hair','head','gold' if i%3 else 'highlight',[[s*(.015+k*.09),.59-.06*k,.10+.14*k],[s*(.19+.10*k),.49,.17+.1*k],[s*(.34+.018*k),.25,.10],[s*.24,.50,-.27],[s*.08,.72,-.2]],.015+(.008 if i%4==0 else 0),32)
    for i in range(4):
        curve('Face framing lock','head','gold' if i%2 else 'highlight',[[s*(.12+i*.016),.56,.22],[s*(.30+i*.014),.36,.29],[s*(.33+i*.018),.02,.19],[s*(.39-i*.009),-.20,.12],[s*.31,-.38,.19]],.012+i*.001,32)

# Short column from the collar to just under the jaw. The old stack ran to
# y=.56 under a head pivot at y=.78, about twice a plausible neck.
shell('Neck alloy','neck','chrome',[(.02,.150,.130,0),(.10,.165,.142,0),(.19,.158,.136,0),(.28,.132,.116,0)])
for y in [.08,.15,.22]:
    curve('Neck seal','neck','edge',[[.158*sin(a),y,.145*cos(a)] for a in [i*2*PI/32 for i in range(33)]],.008,32)
shell('Body undersuit','torso','rubber',[(-.79,.43,.27,0),(-.55,.35,.24,0),(-.2,.38,.26,0),(.18,.55,.30,0),(.43,.56,.22,0),(.54,.20,.16,0)])
shell('Abdominal shell','torso','chrome',[(-.73,.38,.27,.025),(-.48,.32,.27,.025),(-.16,.37,.28,.025),(.09,.50,.29,.02)],-.98,.98)
for s in [-1,1]:
    # Sculpted breastplate, joined visually by a central sternum plate.
    ell('Pectoral armor','torso','chrome',[s*.245,.16,.255],[.27,.265,.165],32,20)
    curve('Armor edge','torso','edge',[[s*.03,.30,.36],[s*.15,.40,.36],[s*.42,.29,.35],[s*.49,.08,.29],[s*.27,-.10,.39],[s*.04,-.02,.35]],.012)
    curve('Power trace','torso','cyan',[[s*.34,-.15,.29],[s*.22,-.34,.29],[s*.20,-.65,.29]],.011)
    curve('Abdominal seam','torso','edge',[[s*.43,-.08,.29],[s*.28,-.32,.28],[s*.28,-.68,.26]],.012)
    for j in range(3):
        y=-.20-j*.13
        curve('Rib articulation','torso','edge',[[s*.26,y,.26],[s*.34,y+.055,.21],[s*.38,y+.1,.12]],.013)
curve('Sternum','torso','edge',[[0,.44,.29],[0,.13,.42],[0,-.16,.32],[0,-.67,.30]],.027)
for y in [.27,.12,-.04]:
    ell('Chest diode','torso','cyan',[0,y,.444 if y>0 else .36],[.026,.012,.008],12,8)
shell('Pelvic suit','body','leather',[(1.05,.40,.26,.02),(1.25,.48,.29,0),(1.42,.43,.27,0)])
shell('Belt','body','edge',[(1.27,.49,.30,0),(1.38,.47,.29,0)])
ell('Belt clasp','body','chrome',[0,1.325,.31],[.11,.07,.025],16,12)
ell('Belt light','body','cyan',[0,1.325,.338],[.06,.013,.005],12,8)

# Open tailored jacket with substantial collar and distinct lapels.
shell('Jacket back','torso','leather',[(-.66,.46,.31,-.035),(-.35,.41,.30,-.02),(.12,.58,.34,-.01),(.40,.65,.29,-.02),(.53,.51,.23,-.02)],.75,2*PI-.75)
for s in [-1,1]:
    v=[[s*.20,.53,.18],[s*.57,.60,.05],[s*.60,.40,.27],[s*.43,.12,.36],[s*.36,.35,.34]]
    mesh('Raised lapel','torso','leather',v,[[0,1,4],[1,2,4],[2,3,4]])
    curve('Lapel piping','torso','edge',[v[0],v[1],v[2],v[3]],.017)
    curve('Lapel light','torso','cyan',[[s*.47,.47,.28],[s*.40,.31,.36]],.013)
    curve('Jacket zipper','torso','chrome',[[s*.43,.11,.37],[s*.37,-.32,.28],[s*.40,-.64,.27]],.009)
    for j in range(8):
        ell('Zip teeth','torso','edge',[s*.405,-.15-j*.052,.30],[.023,.009,.009],8,6)
    joint='sh'+('L' if s<0 else 'R')
    ell('Shoulder jacket',joint,'leather',[0,-.055,0],[.25,.23,.25])
    ell('Shoulder pauldron',joint,'chrome',[s*.035,.025,.025],[.246,.145,.24])
    shell('Upper sleeve',joint,'leather',[(-.73,.15,.155,0),(-.48,.17,.17,0),(-.19,.21,.20,0),(-.06,.22,.21,0)])
    for j in range(3):
        y=-.2-j*.12
        curve('Sleeve seam',joint,'edge',[[s*.18,y,.06],[s*.16,y-.03,.15],[0,y-.04,.18],[-s*.16,y-.03,.15]],.016)
    curve('Upper arm light',joint,'cyan',[[s*.12,-.19,.19],[s*.10,-.43,.177]],.016)
    fa='fa'+('L' if s<0 else 'R')
    ell('Elbow socket',fa,'rubber',[0,0,0],[.16,.17,.16])
    shell('Bracer',fa,'chrome',[(-.73,.115,.12,0),(-.62,.15,.145,0),(-.24,.17,.16,0),(-.10,.145,.14,0)])
    for y in [-.18,-.28,-.6,-.7]:
        shell('Bracer band',fa,'edge',[(y-.017,.174 if y>-.4 else .151,.165 if y>-.4 else .15,0),(y+.017,.174 if y>-.4 else .151,.165 if y>-.4 else .15,0)],-PI,PI,24)
    curve('Bracer trace',fa,'cyan',[[0,-.32,.165],[0,-.55,.16]],.013)
    hand='hand'+('L' if s<0 else 'R')
    ell('Glove',hand,'leather',[0,-.11,.01],[.13,.16,.075])
    for f in range(4):
        x=-.09+f*.06; length=.16+(.035 if f in [1,2] else 0)
        tube('Finger glove',hand,'leather',[[x,-.17,.015],[x,-.26,.025]],.025,10)
        tube('Finger',hand,'skin',[[x,-.25,.025],[x,-.27-length*.3,.04],[x,-.25-length*.65,.06]],.022,10)
        ell('Knuckle',hand,'chrome',[x,-.19,.07],[.023,.03,.012],12,8)
    curve('Thumb',hand,'skin',[[s*.12,-.075,.025],[s*.17,-.14,.045],[s*.16,-.22,.075]],.035,12)
    hip='hip'+('L' if s<0 else 'R')
    shell('Thigh suit',hip,'leather',[(-.95,.16,.17,0),(-.68,.20,.21,0),(-.3,.25,.26,0),(.04,.26,.26,0)])
    shell('Thigh plating',hip,'chrome',[(-.81,.17,.19,.01),(-.61,.20,.23,.01),(-.21,.25,.28,0)],-.85,.85,24)
    curve('Thigh trace',hip,'cyan',[[s*.14,-.24,.23],[s*.12,-.63,.20]],.012)
    # Short split coat tails follow the hips, so sitting uses the existing leg joints.
    shell('Coat tail',hip,'leather',[(-.55,.30,.30,-.03),(-.24,.285,.31,-.03),(.01,.28,.30,-.03)],.9,2*PI-.9,24)
    knee='knee'+('L' if s<0 else 'R')
    ell('Knee joint',knee,'rubber',[0,0,0],[.17,.17,.17])
    ell('Knee cap',knee,'chrome',[0,-.02,.14],[.16,.17,.065])
    shell('Boot',knee,'leather',[(-1.03,.12,.14,.015),(-.81,.14,.16,0),(-.45,.18,.19,0),(-.16,.15,.17,0)])
    shell('Shin armor',knee,'chrome',[(-.88,.10,.17,.02),(-.62,.14,.21,.02),(-.26,.15,.20,.01)],-.8,.8,24)
    curve('Shin trace',knee,'cyan',[[0,-.31,.225],[0,-.72,.22]],.012)
    foot='foot'+('L' if s<0 else 'R')
    ell('Boot sole',foot,'rubber',[0,-.045,.15],[.18,.065,.35])
    ell('Boot vamp',foot,'leather',[0,.035,.13],[.17,.12,.30])
    ell('Toe alloy',foot,'chrome',[0,.03,.33],[.164,.075,.13])

# Coalesce by joint/material: bounded draw calls without changing the articulation.
merged={}
for m in meshes:
    key=(m['joint'],m['material'])
    dest=merged.setdefault(key,{'name':f"{m['joint']}_{m['material']}",'joint':m['joint'],'material':m['material'],'vertices':[],'faces':[]})
    offset=len(dest['vertices']);dest['vertices'].extend(m['vertices']);dest['faces'].extend([[v+offset for v in f] for f in m['faces']])
meshes=list(merged.values())
spec={'name':'Fembot','role':'Cyborg assistant','version':1,'units':'host rig units; multiply by 0.38 for metres','rig':RIG,'materials':MATERIALS,'meshes':meshes}
(OUT/'fembot.mesh.json').write_text(json.dumps(spec,separators=(',',':')),encoding='utf8')

def normals(vs,fs):
    ns=[[0.,0.,0.] for _ in vs]
    for a,b,c in fs:
        u=[vs[b][i]-vs[a][i] for i in range(3)];v=[vs[c][i]-vs[a][i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for k in [a,b,c]:
            for i in range(3):ns[k][i]+=n[i]
    return [[x/(math.sqrt(sum(q*q for q in n)) or 1) for x in n] for n in ns]

binary=bytearray(); views=[]; access=[]
def accessor(data,kind,fmt,ctype,target):
    flat=[x for row in data for x in row] if kind=='VEC3' else data
    while len(binary)%4:binary.append(0)
    offset=len(binary); binary.extend(struct.pack('<'+fmt*len(flat),*flat))
    views.append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset,'target':target})
    entry={'bufferView':len(views)-1,'componentType':ctype,'count':len(data),'type':kind}
    if kind=='VEC3':entry.update(min=[min(v[i] for v in data) for i in range(3)],max=[max(v[i] for v in data) for i in range(3)])
    access.append(entry);return len(access)-1
mat_names=list(MATERIALS)
gltf={'asset':{'version':'2.0','generator':'Fembot deterministic mesh authoring'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Fembot','children':[1]}],'meshes':[],'materials':[],'buffers':[],'bufferViews':views,'accessors':access}
for name,m in MATERIALS.items():
    material={'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':m['color']+[1],'metallicFactor':m['metallic'],'roughnessFactor':m['roughness']}}
    if 'emissive' in m:material['emissiveFactor']=m['emissive']
    gltf['materials'].append(material)
node_map={name:i+1 for i,name in enumerate(RIG)}
for name,(parent,pos) in RIG.items():
    gltf['nodes'].append({'name':'aixiin_'+name,'translation':pos,'children':[],'extras':{'hostJoint':name}})
    if parent:gltf['nodes'][node_map[parent]]['children'].append(node_map[name])
for m in meshes:
    p=accessor(m['vertices'],'VEC3','f',5126,34962);n=accessor(normals(m['vertices'],m['faces']),'VEC3','f',5126,34962);idx=accessor([v for f in m['faces'] for v in f],'SCALAR','I',5125,34963)
    mi=len(gltf['meshes']);gltf['meshes'].append({'name':m['name'],'primitives':[{'attributes':{'POSITION':p,'NORMAL':n},'indices':idx,'material':mat_names.index(m['material'])}]})
    ni=len(gltf['nodes']);gltf['nodes'].append({'name':m['name'],'mesh':mi});gltf['nodes'][node_map[m['joint']]]['children'].append(ni)
gltf['buffers']=[{'byteLength':len(binary)}]
js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
data=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'fembot.glb').write_bytes(data)
summary={'vertices':sum(len(m['vertices']) for m in meshes),'triangles':sum(len(m['faces']) for m in meshes),'drawCalls':len(meshes),'joints':len(RIG),'glbBytes':len(data)}
(OUT/'asset.json').write_text(json.dumps({'id':'fembot','name':'Fembot','role':'Cyborg assistant','model':'fembot.glb','rig':'createBot-v1','style':'stylized interpretation of user reference','stats':summary},indent=2)+'\n')
print(json.dumps(summary))
