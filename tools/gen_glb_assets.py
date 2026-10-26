#!/usr/bin/env python3
"""Generate shippable .glb assets (screw + cute character cores + panel board).
Code-authored meshes — Blender unavailable on this box. Runtime prefers matching JS geometry.
"""
import json, struct, math, os
from pathlib import Path
import numpy as np

OUT = Path('/workspace/screw3d-v2/assets')
OUT.mkdir(parents=True, exist_ok=True)

def pack_glb(nodes, meshes, accessors, buffer_views, bin_blob, materials):
    # Minimal glTF 2.0
    gltf = {
        "asset": {"version": "2.0", "generator": "screw3d-gen"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_blob)}],
        "materials": materials,
    }
    # Only include top-level roots in scene — fix: nodes with children shouldn't all be in scene
    roots = [i for i,n in enumerate(nodes) if n.get('_root')]
    for n in nodes:
        n.pop('_root', None)
        n.pop('_name', None)
    if not roots:
        roots = [0]
    gltf["scenes"] = [{"nodes": roots}]
    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    # pad json to 4-byte
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * json_pad
    bin_pad = (4 - (len(bin_blob) % 4)) % 4
    bin_blob = bin_blob + b'\x00' * bin_pad
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)  # glTF
    out += struct.pack('<II', len(json_bytes), 0x4E4F534A)  # JSON
    out += json_bytes
    out += struct.pack('<II', len(bin_blob), 0x004E4942)  # BIN
    out += bin_blob
    return bytes(out)

class MeshBuilder:
    def __init__(self):
        self.chunks = []  # list of (positions, normals, indices, color_rgba, name)
    def add(self, positions, normals, indices, color, name='part'):
        self.chunks.append((np.asarray(positions, np.float32),
                            np.asarray(normals, np.float32),
                            np.asarray(indices, np.uint32),
                            color, name))
    def to_glb(self, root_name='root'):
        bin_parts = []
        accessors = []
        buffer_views = []
        meshes = []
        materials = []
        nodes = []
        offset = 0
        child_idxs = []
        for positions, normals, indices, color, name in self.chunks:
            # positions
            pb = positions.tobytes()
            buffer_views.append({"buffer":0,"byteOffset":offset,"byteLength":len(pb),"target":34962})
            mn = positions.min(0).tolist(); mx = positions.max(0).tolist()
            accessors.append({"bufferView":len(buffer_views)-1,"componentType":5126,"count":len(positions),"type":"VEC3","max":mx,"min":mn})
            pos_acc = len(accessors)-1
            offset += len(pb); bin_parts.append(pb)
            # normals
            nb = normals.tobytes()
            buffer_views.append({"buffer":0,"byteOffset":offset,"byteLength":len(nb),"target":34962})
            accessors.append({"bufferView":len(buffer_views)-1,"componentType":5126,"count":len(normals),"type":"VEC3"})
            nor_acc = len(accessors)-1
            offset += len(nb); bin_parts.append(nb)
            # indices
            ib = indices.tobytes()
            buffer_views.append({"buffer":0,"byteOffset":offset,"byteLength":len(ib),"target":34963})
            accessors.append({"bufferView":len(buffer_views)-1,"componentType":5125,"count":len(indices),"type":"SCALAR"})
            idx_acc = len(accessors)-1
            offset += len(ib); bin_parts.append(ib)
            # material
            r,g,b = color
            materials.append({
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [r, g, b, 1.0],
                    "metallicFactor": 0.85 if 'steel' in name or 'thread' in name or 'head' in name or 'washer' in name else 0.08,
                    "roughnessFactor": 0.3 if 'steel' in name or 'thread' in name or 'head' in name else 0.45,
                }
            })
            mat_i = len(materials)-1
            meshes.append({
                "name": name,
                "primitives": [{
                    "attributes": {"POSITION": pos_acc, "NORMAL": nor_acc},
                    "indices": idx_acc,
                    "material": mat_i
                }]
            })
            mesh_i = len(meshes)-1
            nodes.append({"name": name, "mesh": mesh_i})
            child_idxs.append(len(nodes)-1)
        # root
        nodes.append({"name": root_name, "children": child_idxs, "_root": True})
        blob = b''.join(bin_parts)
        return pack_glb(nodes, meshes, accessors, buffer_views, blob, materials)

# ---- geometry helpers ----
def cylinder(r_top, r_bot, h, segs=24, z0=0):
    # along Z from z0 to z0+h
    verts=[]; norms=[]; idx=[]
    for i in range(segs):
        a0=2*math.pi*i/segs; a1=2*math.pi*(i+1)/segs
        c0,s0=math.cos(a0),math.sin(a0); c1,s1=math.cos(a1),math.sin(a1)
        # side quad
        p0=(r_bot*c0,r_bot*s0,z0); p1=(r_bot*c1,r_bot*s1,z0)
        p2=(r_top*c1,r_top*s1,z0+h); p3=(r_top*c0,r_top*s0,z0+h)
        base=len(verts)
        # normals approx radial
        n0=(c0,s0,0); n1=(c1,s1,0)
        verts += [p0,p1,p2,p3]; norms += [n0,n1,n1,n0]
        idx += [base,base+1,base+2, base,base+2,base+3]
    # caps
    for z,r,sign in ((z0,r_bot,-1),(z0+h,r_top,1)):
        center=len(verts); verts.append((0,0,z)); norms.append((0,0,sign))
        ring=[]
        for i in range(segs):
            a=2*math.pi*i/segs
            ring.append(len(verts))
            verts.append((r*math.cos(a), r*math.sin(a), z)); norms.append((0,0,sign))
        for i in range(segs):
            if sign>0: idx += [center, ring[i], ring[(i+1)%segs]]
            else: idx += [center, ring[(i+1)%segs], ring[i]]
    return verts, norms, idx

def lathe(profile, segs=48):
    # profile list of (radius, z); rotate around Z
    verts=[]; norms=[]; idx=[]
    # compute ring normals via finite differences in rz plane then rotate
    def ring_normal(i):
        if i==0: dr=profile[1][0]-profile[0][0]; dz=profile[1][1]-profile[0][1]
        elif i==len(profile)-1: dr=profile[i][0]-profile[i-1][0]; dz=profile[i][1]-profile[i-1][1]
        else: dr=profile[i+1][0]-profile[i-1][0]; dz=profile[i+1][1]-profile[i-1][1]
        # tangent (dr,dz) -> normal (dz, -dr) outward-ish
        nx,nz = dz, -dr
        L=math.hypot(nx,nz) or 1
        return nx/L, nz/L
    rings=[]
    for i,(r,z) in enumerate(profile):
        nr,nz = ring_normal(i)
        ring=[]
        for s in range(segs):
            a=2*math.pi*s/segs; c,si=math.cos(a),math.sin(a)
            ring.append(len(verts))
            verts.append((r*c, r*si, z))
            norms.append((nr*c, nr*si, nz))
        rings.append(ring)
    for i in range(len(profile)-1):
        for s in range(segs):
            a=rings[i][s]; b=rings[i][(s+1)%segs]
            c=rings[i+1][(s+1)%segs]; d=rings[i+1][s]
            idx += [a,b,c, a,c,d]
    return verts, norms, idx

def helix_tube(radius=0.048, tube=0.011, z0=-0.02, z1=-0.26, turns=5.5, tubular=120, radial=6):
    verts=[]; norms=[]; idx=[]
    path=[]
    for i in range(tubular+1):
        t=i/tubular
        z=z0+(z1-z0)*t
        a=t*turns*2*math.pi
        path.append((math.cos(a)*radius, math.sin(a)*radius, z, a))
    for i, (px,py,pz,a) in enumerate(path):
        # frame: tangent approx
        if i<len(path)-1:
            tx=path[i+1][0]-px; ty=path[i+1][1]-py; tz=path[i+1][2]-pz
        else:
            tx=px-path[i-1][0]; ty=py-path[i-1][1]; tz=pz-path[i-1][2]
        tl=math.hypot(tx,ty,tz) or 1; tx/=tl; ty/=tl; tz/=tl
        # normal roughly radial from axis
        nx,ny = math.cos(a), math.sin(a)
        # binormal = T x N
        bx = ty*0 - tz*ny; by = tz*nx - tx*0; bz = tx*ny - ty*nx
        bl=math.hypot(bx,by,bz) or 1; bx/=bl; by/=bl; bz/=bl
        # re-orthogonalize N = B x T
        nx = by*tz - bz*ty; ny = bz*tx - bx*tz; nz = bx*ty - by*tx
        for j in range(radial):
            ang=2*math.pi*j/radial
            cx=math.cos(ang)*tube; cy=math.sin(ang)*tube
            vx=px + nx*cx + bx*cy
            vy=py + ny*cx + by*cy
            vz=pz + nz*cx + bz*cy
            verts.append((vx,vy,vz))
            # normal outward on tube
            nnx=nx*math.cos(ang)+bx*math.sin(ang)
            nny=ny*math.cos(ang)+by*math.sin(ang)
            nnz=nz*math.cos(ang)+bz*math.sin(ang)
            nl=math.hypot(nnx,nny,nnz) or 1
            norms.append((nnx/nl,nny/nl,nnz/nl))
    for i in range(tubular):
        for j in range(radial):
            a=i*radial+j; b=i*radial+((j+1)%radial)
            c=(i+1)*radial+((j+1)%radial); d=(i+1)*radial+j
            idx += [a,b,c, a,c,d]
    return verts, norms, idx

def box(sx,sy,sz, cx=0,cy=0,cz=0):
    hx,hy,hz=sx/2,sy/2,sz/2
    # 6 faces
    faces=[
        # +z
        ([(-hx,-hy,hz),(hx,-hy,hz),(hx,hy,hz),(-hx,hy,hz)], (0,0,1)),
        ([(-hx,-hy,-hz),(-hx,hy,-hz),(hx,hy,-hz),(hx,-hy,-hz)], (0,0,-1)),
        ([(hx,-hy,-hz),(hx,hy,-hz),(hx,hy,hz),(hx,-hy,hz)], (1,0,0)),
        ([(-hx,-hy,-hz),(-hx,-hy,hz),(-hx,hy,hz),(-hx,hy,-hz)], (-1,0,0)),
        ([(-hx,hy,-hz),(-hx,hy,hz),(hx,hy,hz),(hx,hy,-hz)], (0,1,0)),
        ([(-hx,-hy,-hz),(hx,-hy,-hz),(hx,-hy,hz),(-hx,-hy,hz)], (0,-1,0)),
    ]
    verts=[]; norms=[]; idx=[]
    for pts,n in faces:
        base=len(verts)
        for p in pts:
            verts.append((p[0]+cx,p[1]+cy,p[2]+cz)); norms.append(n)
        idx += [base,base+1,base+2, base,base+2,base+3]
    return verts, norms, idx

def sphere(r, segs=16, rings=12, cx=0,cy=0,cz=0):
    verts=[]; norms=[]; idx=[]
    for i in range(rings+1):
        v=i/rings; phi=v*math.pi
        for j in range(segs):
            u=j/segs; th=u*2*math.pi
            x=r*math.sin(phi)*math.cos(th)
            y=r*math.sin(phi)*math.sin(th)
            z=r*math.cos(phi)
            verts.append((x+cx,y+cy,z+cz)); norms.append((x/r,y/r,z/r) if r else (0,1,0))
    for i in range(rings):
        for j in range(segs):
            a=i*segs+j; b=i*segs+((j+1)%segs)
            c=(i+1)*segs+((j+1)%segs); d=(i+1)*segs+j
            idx += [a,b,c, a,c,d]
    return verts, norms, idx

def rounded_box(sx,sy,sz, rad=0.12, segs=3, cx=0,cy=0,cz=0):
    # Approximate via inflated box corners — for asset shipping use subdivided box + sphere corners
    # Simpler: use box + slight scale; for GLB use multi-sphere + box core
    return box(sx,sy,sz,cx,cy,cz)

# ---- build screw ----
def build_screw(path):
    mb = MeshBuilder()
    # head lathe (colored red default)
    head_prof = [
        (0.0, -0.01),(0.118,-0.01),(0.138,-0.005),(0.142,0.008),
        (0.128,0.018),(0.118,0.028),(0.105,0.042),(0.078,0.055),
        (0.045,0.062),(0.018,0.064),(0.0,0.064)
    ]
    v,n,i = lathe(head_prof, 56)
    mb.add(v,n,i, (1.0,0.42,0.42), 'head')
    washer_prof = [(0.108,-0.012),(0.145,-0.012),(0.148,-0.004),(0.140,0.002),(0.108,0.002),(0.108,-0.012)]
    v,n,i = lathe(washer_prof, 48)
    mb.add(v,n,i, (1.0,0.45,0.45), 'washer')
    v,n,i = cylinder(0.042, 0.038, 0.26, 24, z0=-0.27)
    mb.add(v,n,i, (0.72,0.75,0.78), 'steel_shaft')
    # tip cone approx cylinder taper
    v,n,i = cylinder(0.005, 0.038, 0.055, 18, z0=-0.325)
    mb.add(v,n,i, (0.72,0.75,0.78), 'steel_tip')
    v,n,i = helix_tube()
    mb.add(v,n,i, (0.60,0.64,0.69), 'thread')
    # phillips slots
    for rot in (0, math.pi/2):
        # rotated thin box on top
        hx,hy,hz = 0.095/2, 0.022/2, 0.028/2
        # generate box then rotate around Z
        bv,bn,bi = box(0.095,0.022,0.028, 0,0,0.055)
        c,s = math.cos(rot), math.sin(rot)
        rv=[]; rn=[]
        for (x,y,z) in bv:
            rv.append((x*c - y*s, x*s + y*c, z))
        for (x,y,z) in bn:
            rn.append((x*c - y*s, x*s + y*c, z))
        mb.add(rv,rn,bi, (0.1,0.1,0.12), 'slot')
    data = mb.to_glb('screw')
    path.write_bytes(data)
    print('wrote', path, len(data), 'bytes')

def build_panel(path):
    mb = MeshBuilder()
    # beveled board: main slab + slight edge bevel via second inset
    v,n,i = box(1.0, 0.7, 0.16)
    mb.add(v,n,i, (1.0,0.97,0.92), 'panel_face')
    # rim darker
    v,n,i = box(1.04, 0.74, 0.04, 0,0,-0.06)
    mb.add(v,n,i, (0.92,0.88,0.80), 'panel_rim')
    path.write_bytes(mb.to_glb('panel'))
    print('wrote', path)

def build_character(name, parts, path):
    """parts: list of (type, size, pos, color) type in box/sph/cyl"""
    mb = MeshBuilder()
    for i,p in enumerate(parts):
        t,s,pos,col = p['t'], p['s'], p['p'], p['c']
        cx,cy,cz = pos
        if t=='box':
            v,n,ix = box(s[0],s[1],s[2], cx,cy,cz)
        elif t=='sph':
            v,n,ix = sphere(s[0], 20, 14, cx,cy,cz)
        elif t=='cyl':
            # cyl along Y by default in models — convert: build along Z then we'd need rotate; keep along Y
            # Build cylinder along Y
            r,h = s[0], s[1]
            segs=20
            verts=[]; norms=[]; idx=[]
            y0=cy-h/2; y1=cy+h/2
            for k in range(segs):
                a0=2*math.pi*k/segs; a1=2*math.pi*(k+1)/segs
                c0,s0=math.cos(a0),math.sin(a0); c1,s1=math.cos(a1),math.sin(a1)
                base=len(verts)
                verts += [(cx+r*c0,y0,cz+r*s0),(cx+r*c1,y0,cz+r*s1),(cx+r*c1,y1,cz+r*s1),(cx+r*c0,y1,cz+r*s0)]
                norms += [(c0,0,s0),(c1,0,s1),(c1,0,s1),(c0,0,s0)]
                idx += [base,base+1,base+2,base,base+2,base+3]
            v,n,ix = verts,norms,idx
        else:
            v,n,ix = box(0.4,0.4,0.4,cx,cy,cz)
        # color hex int -> rgb
        if isinstance(col, int):
            rgb = (((col>>16)&255)/255, ((col>>8)&255)/255, (col&255)/255)
        else:
            rgb = col
        mb.add(v,n,ix, rgb, f'{name}_{i}')
    path.write_bytes(mb.to_glb(name))
    print('wrote', path)

# Characters (simplified cute cores matching models.js anchors roughly)
CAT = [
    {'t':'box','s':[2.0,1.3,1.4],'p':[0,-0.35,0],'c':0xf6c48b},
    {'t':'box','s':[1.4,1.2,1.2],'p':[0,0.85,0.25],'c':0xf6c48b},
    {'t':'sph','s':[0.11],'p':[-0.3,0.95,0.86],'c':0x3a2e2a},
    {'t':'sph','s':[0.11],'p':[0.3,0.95,0.86],'c':0x3a2e2a},
    {'t':'sph','s':[0.08],'p':[0,0.75,0.87],'c':0xff8f9e},
    {'t':'cyl','s':[0.2,0.5],'p':[-0.65,-1.2,0.4],'c':0xfff1dc},
    {'t':'cyl','s':[0.2,0.5],'p':[0.65,-1.2,0.4],'c':0xfff1dc},
    {'t':'cyl','s':[0.2,0.5],'p':[-0.65,-1.2,-0.4],'c':0xfff1dc},
    {'t':'cyl','s':[0.2,0.5],'p':[0.65,-1.2,-0.4],'c':0xfff1dc},
]
BEAR = [
    {'t':'box','s':[1.8,1.4,1.4],'p':[0,-0.4,0],'c':0xc99a74},
    {'t':'box','s':[1.5,1.3,1.3],'p':[0,0.95,0.1],'c':0xc99a74},
    {'t':'box','s':[0.7,0.45,0.3],'p':[0,0.72,0.85],'c':0xf3e0c8},
    {'t':'sph','s':[0.1],'p':[0,0.82,1.0],'c':0x3a2e2a},
    {'t':'sph','s':[0.1],'p':[-0.35,1.15,0.76],'c':0x3a2e2a},
    {'t':'sph','s':[0.1],'p':[0.35,1.15,0.76],'c':0x3a2e2a},
]
ROBOT = [
    {'t':'box','s':[1.6,1.6,1.1],'p':[0,-0.2,0],'c':0x8fd3c7},
    {'t':'box','s':[1.2,0.9,0.95],'p':[0,1.2,0],'c':0x8fd3c7},
    {'t':'cyl','s':[0.18,0.3],'p':[0,0.65,0],'c':0x5b6f82},
    {'t':'sph','s':[0.07],'p':[-0.2,1.25,0.53],'c':0x7ef9ff},
    {'t':'sph','s':[0.07],'p':[0.2,1.25,0.53],'c':0x7ef9ff},
]
CAR = [
    {'t':'box','s':[2.8,0.8,1.5],'p':[0,-0.45,0],'c':0xff8a65},
    {'t':'box','s':[1.5,0.75,1.3],'p':[-0.15,0.32,0],'c':0xff8a65},
    {'t':'sph','s':[0.13],'p':[1.4,-0.35,0.45],'c':0xfff2a8},
    {'t':'sph','s':[0.13],'p':[1.4,-0.35,-0.45],'c':0xfff2a8},
]
CAKE = [
    {'t':'box','s':[2.2,0.9,2.2],'p':[0,-0.75,0],'c':0xfff1d6},
    {'t':'box','s':[1.6,0.8,1.6],'p':[0,0.1,0],'c':0xffc6d3},
    {'t':'box','s':[1.0,0.6,1.0],'p':[0,0.8,0],'c':0xa86b4c},
    {'t':'sph','s':[0.22],'p':[0,1.32,0],'c':0xff4d6d},
]
POPSICLE = [
    {'t':'box','s':[1.6,2.2,0.7],'p':[0,0.3,0],'c':0xa8e6cf},
    {'t':'box','s':[0.3,1.0,0.14],'p':[0,-1.25,0],'c':0xe0b483},
]
ROCKET = [
    {'t':'box','s':[1.2,2.2,1.2],'p':[0,0,0],'c':0xf4f1ea},
    {'t':'sph','s':[0.55],'p':[0,1.4,0],'c':0xff7a6b},
    {'t':'cyl','s':[0.42,0.3],'p':[0,-1.25,0],'c':0x5b6f82},
]
UFO = [
    {'t':'sph','s':[0.9],'p':[0,0,0],'c':0xc8c3ff},  # will look ball-ish; runtime uses better saucer
    {'t':'sph','s':[0.55],'p':[0,0.35,0],'c':0xbff4ff},
    {'t':'sph','s':[0.18],'p':[0,0.7,0.25],'c':0x8be38b},
]

if __name__ == '__main__':
    build_screw(OUT / 'screw.glb')
    build_panel(OUT / 'panel.glb')
    for name, parts in [('cat',CAT),('bear',BEAR),('robot',ROBOT),('car',CAR),
                        ('cake',CAKE),('popsicle',POPSICLE),('rocket',ROCKET),('ufo',UFO)]:
        build_character(name, parts, OUT / f'{name}.glb')
    print('done', list(OUT.iterdir()))
