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
    'lip': {'color': [.86, .32, .48], 'roughness': .28, 'metallic': .06},
    'chrome': {'color': [.55, .63, .73], 'roughness': .22, 'metallic': .92},
    'edge': {'color': [.16, .21, .28], 'roughness': .27, 'metallic': .85},
    'leather': {'color': [.012, .018, .027], 'roughness': .38, 'metallic': .18},
    'rubber': {'color': [.008, .011, .018], 'roughness': .68, 'metallic': .05},
    'hair': {'color': [.28, .13, .05], 'roughness': .5, 'metallic': .08},
    'gold': {'color': [.92, .72, .08], 'roughness': .42, 'metallic': .16},
    'highlight': {'color': [.95, .84, .38], 'roughness': .36, 'metallic': .14},
    'cyan': {'color': [.01, .55, .8], 'roughness': .23, 'metallic': .35, 'emissive': [.01, .65, 1]},
    'white': {'color': [.78, .83, .81], 'roughness': .28, 'metallic': 0},
    'iris': {'color': [.35, .82, 1], 'roughness': .2, 'metallic': .02, 'emissive': [.2, .85, 1]},
    'nose': {'color': [1, .38, .42], 'roughness': .24, 'metallic': .02, 'emissive': [1, .16, .22]},
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

def mesh(name, joint, mat, verts, faces, flat=False):
    # flat splits later into one vertex per corner so face normals survive
    # the studio render, which marks every polygon smooth.
    meshes.append({'name': name, 'joint': joint, 'material': mat,
                   'vertices': [[round(v, 6) for v in p] for p in verts],
                   'faces': faces, 'flat': flat})

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

def annulus(name, joint, mat, center, r0, r1, axis='z', seg=32):
    # Flat ring. +Z faces the front; +X faces the character's left.
    vs=[]; fs=[]
    for i in range(seg):
        t=2*PI*i/seg; ca,sa=cos(t),sin(t)
        if axis=='x':
            inner=[center[0], center[1]+r0*ca, center[2]+r0*sa]
            outer=[center[0], center[1]+r1*ca, center[2]+r1*sa]
        else:
            inner=[center[0]+r0*ca, center[1]+r0*sa, center[2]]
            outer=[center[0]+r1*ca, center[1]+r1*sa, center[2]]
        vs.extend([inner, outer])
    for i in range(seg):
        a=i*2; b=((i+1)%seg)*2
        fs.extend([[a, a+1, b],[a+1, b+1, b]])
    mesh(name, joint, mat, vs, fs)

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

# Faceted silver head for issue #47. Crown spike, narrow cyan eyes, a small
# red nose, a thin mouth, and flat side ears. head_iris stays the eyes so the
# facing test still has a target. +X is the character's left; lathe i=0 is +Z.
def sub(a,b): return [a[i]-b[i] for i in range(3)]
def cross(u,v): return [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
def dot(u,v): return u[0]*v[0]+u[1]*v[1]+u[2]*v[2]
def unit(v):
    L=math.sqrt(dot(v,v)) or 1
    return [x/L for x in v]
def add_tri(vs, fs, a, b, c, center):
    n=cross(sub(vs[b],vs[a]), sub(vs[c],vs[a]))
    if dot(n,n) < 1e-16: return
    mid=[(vs[a][i]+vs[b][i]+vs[c][i])/3 for i in range(3)]
    if dot(n, sub(mid, center)) < 0: b,c = c,b
    fs.append([a,b,c])

N=10
# Authored small, then widened. The pauldrons leave about a 0.94 gap; the
# skull should fill it instead of sitting as a thin shell on the collar.
SX, SY, SZ = 1.7, 1.15, 1.85
# (y, x radius, z radius, z centre). The chin stays below y=-.22 so it meets the collar.
rings=[
    (-.24,.11,.085,.055),
    (-.14,.19,.135,.04),
    (-.05,.24,.155,.032),
    (.04,.265,.162,.026),
    (.12,.285,.148,.02),
    (.19,.275,.16,.03),
    (.26,.25,.15,.012),
    (.33,.20,.125,.0),
    (.39,.11,.075,-.008),
]
def ring_point(ri, i):
    y,rx,rz,zc=rings[ri]
    a=2*PI*i/N
    front=max(0., cos(a))
    return [SX*rx*sin(a), SY*y, SZ*(zc+rz*cos(a))+.02*front*front]
def facet_point(r0, i0, u, v):
    p00=ring_point(r0, i0%N); p01=ring_point(r0, (i0+1)%N)
    p10=ring_point(r0+1, i0%N); p11=ring_point(r0+1, (i0+1)%N)
    def mix(p,q,t): return [p[k]*(1-t)+q[k]*t for k in range(3)]
    return mix(mix(p00,p01,u), mix(p10,p11,u), v)
def outward_normal(p00, p01, p10):
    n=unit(cross(sub(p01,p00), sub(p10,p00)))
    mid=[(p00[i]+p01[i]+p10[i])/3 for i in range(3)]
    if dot(n, sub(mid, [0,.05,.02])) < 0: n=[-x for x in n]
    return n

vs=[]; fs=[]; inside=[0,.08*SY,.02*SZ]
for ri in range(len(rings)):
    for i in range(N): vs.append(ring_point(ri, i))
for ri in range(len(rings)-1):
    for i in range(N):
        a=ri*N+i; b=ri*N+(i+1)%N; c=(ri+1)*N+i; d=(ri+1)*N+(i+1)%N
        add_tri(vs, fs, a, b, d, inside)
        add_tri(vs, fs, a, d, c, inside)
chin=[0,-.29*SY,.07*SZ]
ci=len(vs); vs.append(chin)
for i in range(N):
    add_tri(vs, fs, ci, (i+1)%N, i, inside)
front_nz=[]
for a,b,c in fs:
    mid=[(vs[a][i]+vs[b][i]+vs[c][i])/3 for i in range(3)]
    if mid[2] > .12 and abs(mid[0]) < .08 and -.12 < mid[1] < .22:
        front_nz.append(unit(cross(sub(vs[b],vs[a]), sub(vs[c],vs[a])))[2])
if not front_nz or min(front_nz) < .35:
    raise SystemExit('face facets do not point forward: %s' % front_nz)
crown=[0,.43*SY,-.008*SZ]
ki=len(vs); vs.append(crown)
base=(len(rings)-1)*N
for i in range(N):
    add_tri(vs, fs, ki, base+i, base+(i+1)%N, inside)
# Spike base sits inside the crown, so the tip reads as one antenna.
spike_r=.012*SX; spike_z=-.008*SZ; spike_seg=5; spike_y=.41*SY
sb=len(vs)
for j in range(spike_seg):
    a=2*PI*j/spike_seg
    vs.append([spike_r*sin(a), spike_y, spike_z+spike_r*cos(a)])
tip=len(vs); vs.append([0, spike_y+.64, spike_z])
spike_inside=[0, spike_y+.32, spike_z]
for j in range(spike_seg):
    add_tri(vs, fs, sb+j, sb+(j+1)%spike_seg, tip, spike_inside)
for j in range(1, spike_seg-1):
    add_tri(vs, fs, sb, sb+j+1, sb+j, spike_inside)
def add_disc(origin, axis, radius=.055, depth=.02, seg=16):
    ax=unit(axis)
    tmp=[0,1,0] if abs(ax[1]) < .9 else [1,0,0]
    bx=unit(cross(tmp, ax)); by=unit(cross(ax, bx))
    i0=len(vs)
    for sign in (-1, 1):
        for j in range(seg):
            t=2*PI*j/seg
            vs.append([origin[k]+sign*depth*.5*ax[k]+radius*(bx[k]*cos(t)+by[k]*sin(t)) for k in range(3)])
    for j in range(seg):
        a=i0+j; b=i0+(j+1)%seg; c=i0+seg+j; d=i0+seg+(j+1)%seg
        add_tri(vs, fs, a, b, c, origin)
        add_tri(vs, fs, b, d, c, origin)
    for j in range(1, seg-1):
        add_tri(vs, fs, i0, i0+j, i0+j+1, origin)
        add_tri(vs, fs, i0+seg, i0+seg+j+1, i0+seg+j, origin)
side=ring_point(4, N//4)
ear_axis=[.9, 0, .44]
add_disc([side[0]+.02*SX, side[1], side[2]], ear_axis, radius=.062*SX)
add_disc([-side[0]-.02*SX, side[1], side[2]], [-ear_axis[0], 0, ear_axis[2]], radius=.062*SX)
mesh('Cranium','head','chrome',vs,fs,flat=True)

def diamond(name, joint, mat, pts, normal, lift=.006):
    q=[[p[k]+normal[k]*lift for k in range(3)] for p in pts]
    behind=[q[0][k]-normal[k] for k in range(3)]
    dv=list(q); df=[]
    add_tri(dv, df, 0, 1, 2, behind)
    add_tri(dv, df, 0, 2, 3, behind)
    nz=unit(cross(sub(dv[df[0][1]], dv[df[0][0]]), sub(dv[df[0][2]], dv[df[0][0]])))[2]
    if nz < .5: raise SystemExit('%s faces %s, not +Z' % (name, round(nz, 3)))
    mesh(name, joint, mat, dv, df, flat=True)
def eye_pts(s):
    # Outer corner is slightly higher than the inner corner.
    if s>0:
        i0,m=0,(lambda u: u)
    else:
        i0,m=N-1,(lambda u: 1-u)
    return [facet_point(4, i0, m(u), v) for u,v in ((.2,.36),(.52,.58),(.92,.48),(.5,.28))]
for s in (-1, 1):
    pts=eye_pts(s)
    diamond('Iris','head','iris',pts,outward_normal(pts[0], pts[1], pts[3]))
top=facet_point(3, 0, 0, .7)
bot=facet_point(3, 0, 0, .12)
left=facet_point(3, 0, .18, .4)
right=facet_point(3, N-1, 1-.18, .4)
nose_n=outward_normal(right, top, left)
apex=[(top[i]+bot[i])*.5+nose_n[i]*.032*SZ for i in range(3)]
if apex[2] <= max(top[2], bot[2], left[2], right[2]):
    raise SystemExit('nose sits behind the face')
nv=[top, left, bot, right, apex]
nf=[]; nose_in=[apex[i]-nose_n[i] for i in range(3)]
for i in range(4):
    add_tri(nv, nf, i, (i+1)%4, 4, nose_in)
mesh('Nose','head','nose',nv,nf,flat=True)
lip=ring_point(2, 0)
mouth_y, mouth_z=lip[1]+.015*SY, lip[2]+.012*SZ
mw, mh=.07*SX, .008*SY
mouth=[[-mw, mouth_y+mh, mouth_z],[mw, mouth_y+mh, mouth_z],[mw, mouth_y-mh, mouth_z],[-mw, mouth_y-mh, mouth_z]]
diamond('Mouth','head','black',mouth,[0,0,1],0)
# Jaw pivot is head (0, -.18, .12). Positive jaw X drops this plate and opens the line.
low_y=mouth_y-mh-.006*SY
mz=mouth_z
xs=(-.062*SX,.062*SX); ys=(low_y-.028*SY, low_y); zs=(mz-.018*SZ, mz-.008*SZ)
pv=[]
for z in zs:
    for y in ys:
        for x in xs:
            pv.append([x, y+.18, z-.12])
jc=[0, (ys[0]+ys[1])*.5+.18, (zs[0]+zs[1])*.5-.12]
pf=[]
def quad(a,b,c,d):
    add_tri(pv, pf, a, b, c, jc)
    add_tri(pv, pf, a, c, d, jc)
quad(4,5,7,6); quad(1,0,2,3); quad(2,6,7,3); quad(0,1,5,4); quad(1,3,7,5); quad(0,4,6,2)
mesh('Lower mouth','jaw','chrome',pv,pf,flat=True)

# Short column from the collar to just under the jaw. The old stack ran to
# y=.56 under a head pivot at y=.78, about twice a plausible neck.
shell('Neck alloy','neck','chrome',[(.02,.183,.159,0),(.10,.201,.173,0),(.19,.193,.166,0),(.28,.161,.142,0)])
for y in [.08,.15,.22]:
    curve('Neck seal','neck','edge',[[.195*sin(a),y,.170*cos(a)] for a in [i*2*PI/32 for i in range(33)]],.01,32)
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
# A flat piece splits every triangle of that pair, so faceted metal stays on its own material.
merged={}
for m in meshes:
    key=(m['joint'],m['material'])
    dest=merged.setdefault(key,{'name':f"{m['joint']}_{m['material']}",'joint':m['joint'],'material':m['material'],'vertices':[],'faces':[],'flat':False})
    if m.get('flat'): dest['flat']=True
    offset=len(dest['vertices']);dest['vertices'].extend(m['vertices']);dest['faces'].extend([[v+offset for v in f] for f in m['faces']])
meshes=list(merged.values())
for m in meshes:
    if not m.pop('flat', False): continue
    split_vs=[]; split_fs=[]
    for a,b,c in m['faces']:
        b0=len(split_vs)
        split_vs.extend([m['vertices'][a], m['vertices'][b], m['vertices'][c]])
        split_fs.append([b0, b0+1, b0+2])
    m['vertices']=split_vs; m['faces']=split_fs
head=next(m for m in meshes if m['name']=='head_chrome')
head_min_y=min(v[1] for v in head['vertices'])
head_max_y=max(v[1] for v in head['vertices'])
head_max_x=max(abs(v[0]) for v in head['vertices'])
if head_min_y >= -.22: raise SystemExit('chin %s does not reach the neck' % head_min_y)
if head_max_y < .9: raise SystemExit('spike %s is too short' % head_max_y)
if head_max_x < .26: raise SystemExit('ears %s do not clear the cranium' % head_max_x)
iris=next(m for m in meshes if m['name']=='head_iris')
ic=[sum(v[i] for v in iris['vertices'])/len(iris['vertices']) for i in range(3)]
if ic[2] <= abs(ic[0])+.05: raise SystemExit('eyes are not in front: %s' % ic)
if not any(m['name']=='jaw_chrome' for m in meshes): raise SystemExit('jaw mouth missing')
if not any(m['name']=='head_nose' for m in meshes): raise SystemExit('nose missing')
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
print(json.dumps({**summary, 'headMinY':round(head_min_y,4), 'spikeTop':round(head_max_y,4), 'irisCenter':[round(v,4) for v in ic]}))
