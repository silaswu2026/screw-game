# Original rocket for the screw demo. Built and baked in Blender.
# No downloaded meshes. Run:
#   blender -b -P tools/blender/rocket.py -- --out rocket-demo/assets
#   add --quick to skip Cycles (flat AO / normal) while tuning shapes.
#
# Grid: 8 sectors around Z, rings up the stack, layers out from the core.
# Which screw is blocked comes from a ray along its axis: a fairing, bezel,
# skirt, or fin sole has to physically sit outside that screw. AO + normal bake.

import bpy
import bmesh
import json
import math
import os
import random
import sys

from mathutils import Matrix, Vector

NSECTOR = 8
# sRGB candy hues. Written into the palette image as linear so they stay
# saturated after the glTF sRGB encode (linear values were exporting pale).
PALETTE = [
    ("red", (0.93, 0.13, 0.18)),
    ("orange", (1.00, 0.42, 0.05)),
    ("yellow", (1.00, 0.78, 0.06)),
    ("lime", (0.58, 0.88, 0.08)),
    ("green", (0.08, 0.70, 0.26)),
    ("teal", (0.00, 0.70, 0.66)),
    ("sky", (0.12, 0.52, 1.00)),
    ("royal", (0.18, 0.28, 0.95)),
    ("purple", (0.56, 0.18, 0.92)),
    ("pink", (1.00, 0.22, 0.55)),
    ("cream", (1.00, 0.94, 0.86)),
    ("skin", (1.00, 0.70, 0.56)),
    ("stone", (0.58, 0.38, 0.28)),
]
PALETTE_I = {n: i for i, (n, _) in enumerate(PALETTE)}
SCREW_COLORS = ["pink", "yellow", "lime", "cyan", "orange", "red", "blue", "purple"]
NBOX = 4
FORBID = {
    "red": {"red"},
    "orange": {"orange"},
    "yellow": {"yellow"},
    "lime": {"lime"},
    "green": {"lime"},
    "teal": {"cyan"},
    "sky": {"cyan", "blue"},
    "royal": {"blue"},
    "purple": {"purple"},
    "pink": {"pink"},
    "cream": set(),
    "skin": set(),
    "stone": set(),
}


def srgb_to_linear(rgb):
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return tuple(f(c) for c in rgb)

PANEL_R0, PANEL_R1 = 0.545, 0.70
CORE_R = 0.40
# Left porthole, and the up0 fastener its tab hides. The offset clears both
# window cuts (radius 0.125) so the screw sits on metal, under the tab.
PORT_L_A = math.radians(-106)
PORT_R_A = math.radians(-74)
UP0_PORT_A = PORT_L_A - 0.28 / PANEL_R1

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
QUICK = "--quick" in argv
OUT = "rocket-demo/assets"
RES = 512
if "--out" in argv:
    OUT = argv[argv.index("--out") + 1]
if "--res" in argv:
    RES = int(argv[argv.index("--res") + 1])
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

PARTS = []
SCREWS = []
PAINT = {}
ALL_OBJS = []


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def to_mesh(bm, name, flip_check=True):
    if flip_check and bm.faces:
        bm.normal_update()
        score = 0.0
        for f in bm.faces:
            score += f.normal.dot(f.calc_center_median())
        if score < 0:
            bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    ALL_OBJS.append(obj)
    return obj


def apply_mods(obj):
    if not obj.modifiers:
        return
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = new_me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    obj.data.update()


def bevel(obj, width=0.016, segs=2, sub=0, angle=38):
    b = obj.modifiers.new("Bevel", "BEVEL")
    b.width = width
    b.segments = segs
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(angle)
    if sub:
        s = obj.modifiers.new("Sub", "SUBSURF")
        s.levels = sub
        s.render_levels = sub
    apply_mods(obj)
    for p in obj.data.polygons:
        p.use_smooth = True


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.update()


def lathe(name, profile, segs=32):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = i / segs * math.tau
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0, r1 = profile[i][0], profile[i + 1][0]
        for j in range(segs):
            j2 = (j + 1) % segs
            v00, v01 = rings[i][j], rings[i][j2]
            v10, v11 = rings[i + 1][j], rings[i + 1][j2]
            try:
                if r0 < 1e-5 and r1 < 1e-5:
                    continue
                if r0 < 1e-5:
                    bm.faces.new((v00, v11, v10))
                elif r1 < 1e-5:
                    bm.faces.new((v00, v01, v10))
                else:
                    bm.faces.new((v00, v01, v11, v10))
            except ValueError:
                pass
    return to_mesh(bm, name)


def arc_shell(name, z0, z1, a0, a1, r0, r1, na=12, nz=7):
    bm = bmesh.new()
    grid = {}

    def V(ia, iz, ir):
        key = (ia, iz, ir)
        if key not in grid:
            a = a0 + (a1 - a0) * ia / na
            z = z0 + (z1 - z0) * iz / nz
            r = r0 + (r1 - r0) * ir
            grid[key] = bm.verts.new((math.cos(a) * r, math.sin(a) * r, z))
        return grid[key]

    for ia in range(na):
        for iz in range(nz):
            bm.faces.new((V(ia, iz, 1), V(ia + 1, iz, 1), V(ia + 1, iz + 1, 1), V(ia, iz + 1, 1)))
            bm.faces.new((V(ia, iz, 0), V(ia, iz + 1, 0), V(ia + 1, iz + 1, 0), V(ia + 1, iz, 0)))
    for iz in range(nz):
        bm.faces.new((V(0, iz, 0), V(0, iz, 1), V(0, iz + 1, 1), V(0, iz + 1, 0)))
        bm.faces.new((V(na, iz, 1), V(na, iz, 0), V(na, iz + 1, 0), V(na, iz + 1, 1)))
    for ia in range(na):
        bm.faces.new((V(ia, 0, 1), V(ia, 0, 0), V(ia + 1, 0, 0), V(ia + 1, 0, 1)))
        bm.faces.new((V(ia, nz, 0), V(ia, nz, 1), V(ia + 1, nz, 1), V(ia + 1, nz, 0)))
    return to_mesh(bm, name)


def join_bm(obj, extra):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    vmap = {}
    extra.verts.ensure_lookup_table()
    for v in extra.verts:
        vmap[v.index] = bm.verts.new(v.co)
    for f in extra.faces:
        try:
            bm.faces.new([vmap[v.index] for v in f.verts])
        except ValueError:
            pass
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    extra.free()


def rivet(pos, normal, radius=0.012):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    bmesh.ops.scale(bm, verts=list(bm.verts), vec=Vector((1, 1, 0.42)))
    n = Vector(normal).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n)
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=q.to_matrix().to_4x4())
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=Vector(pos) + n * (radius * 0.35))
    return bm


def sector_center(i):
    return -math.pi / 2 + i * (math.tau / NSECTOR)


def steer_clear(ang):
    """Keep a radial screw off the booster axes and the fin blades."""
    hazards = (0.0, math.pi, -math.pi, 0.30, math.pi - 0.30, sector_center(3))

    def gap(a):
        return min(abs((a - h + math.pi) % math.tau - math.pi) for h in hazards)

    if gap(ang) >= 0.22:
        return ang
    best, bestg = ang, gap(ang)
    for step in (0.16, -0.16, 0.32, -0.32, 0.48, -0.48):
        trial = ang + step
        g = gap(trial)
        if g > bestg:
            best, bestg = trial, g
    return best


def cover_angles(sectors, gap=0.055):
    half = math.tau / NSECTOR * 0.5
    angs = [sector_center(s) for s in sectors]
    sx = sum(math.cos(a) for a in angs)
    sy = sum(math.sin(a) for a in angs)
    mean = math.atan2(sy, sx)
    rel = [((a - mean + math.pi) % math.tau) - math.pi for a in angs]
    return mean + min(rel) - half + gap, mean + max(rel) + half - gap


def polar(angle, r, z):
    return Vector((math.cos(angle) * r, math.sin(angle) * r, z))


def yup(v):
    v = Vector(v)
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def outward(sectors, lift=0.45, dist=1.15):
    acc = Vector((0, 0, 0))
    for s in sectors:
        a = sector_center(s)
        acc.x += math.cos(a)
        acc.y += math.sin(a)
    if acc.length < 1e-6:
        acc = Vector((0, -1, 0))
    acc.normalize()
    acc *= dist
    acc.z = lift
    return acc


def add_screw(pid, pos, normal):
    SCREWS.append({
        "part": pid,
        "pos": Vector(pos),
        "normal": Vector(normal).normalized(),
        "coveredBy": [],
    })


def add_box(obj, center, ax, ay, az):
    """Join a box. ax, ay, az are the full edge vectors (side to opposite side)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    c = Vector(center)
    M = Matrix((
        (ax.x, ay.x, az.x, c.x),
        (ax.y, ay.y, az.y, c.y),
        (ax.z, ay.z, az.z, c.z),
        (0.0, 0.0, 0.0, 1.0),
    ))
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=M)
    join_bm(obj, bm)


def add_pad(obj, origin, normal, tangent, w=0.10, h=0.08, thick=0.05):
    """Boss whose front face is centered on origin. The body runs back along -normal
    so an embedded shank has metal behind the cap."""
    n = Vector(normal).normalized()
    t = Vector(tangent)
    t = t - n * t.dot(n)
    if t.length < 1e-6:
        t = n.cross(Vector((0, 0, 1)))
        if t.length < 1e-6:
            t = n.cross(Vector((1, 0, 0)))
    t.normalize()
    b = n.cross(t).normalized()
    origin = Vector(origin)
    add_box(obj, origin - n * (thick * 0.5), t * w, b * h, n * thick)


def seat_screw(obj, pid, pos, normal, tangent=None, w=0.09, h=0.07, thick=0.045):
    n = Vector(normal).normalized()
    if tangent is None:
        tangent = n.cross(Vector((0, 0, 1)))
        if tangent.length < 1e-6:
            tangent = n.cross(Vector((1, 0, 0)))
    add_pad(obj, pos, n, tangent, w=w, h=h, thick=thick)
    add_screw(pid, pos, n)


def tag(obj, role, paint):
    obj["role"] = role
    PAINT[obj.name] = paint
    return obj


def fuse(name, objs):
    objs = [o for o in objs if o]
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def register(obj, pid, *, space, layer, sectors, rings, fall, cell, paint, role="part"):
    obj.name = pid
    obj.data.name = pid
    PAINT[pid] = paint
    obj["role"] = role
    PARTS.append({
        "id": pid,
        "obj": obj,
        "space": space,
        "layer": layer,
        "sectors": list(sectors),
        "rings": list(rings),
        "fall": Vector(fall),
        "cell": cell,
        "blocks": [],
    })


def cut_hole(obj, angle, z, radius):
    r = (PANEL_R0 + PANEL_R1) * 0.5
    loc = polar(angle, r, z)
    direction = Vector((math.cos(angle), math.sin(angle), 0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=0.9, location=loc)
    cut = bpy.context.active_object
    cut.rotation_mode = "QUATERNION"
    cut.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction)
    bpy.context.view_layer.update()
    mod = obj.modifiers.new("Hole", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "FAST"
    mod.object = cut
    before = len(obj.data.vertices)
    apply_mods(obj)
    name = cut.name
    bpy.data.objects.remove(cut, do_unlink=True)
    PAINT.pop(name, None)
    print(f"  hole {obj.name} verts {before}->{len(obj.data.vertices)}")


def add_rivet_row(obj, a0, a1, z0, z1, r, n=4):
    for i in range(n):
        a = a0 + (a1 - a0) * ((i + 0.5) / n)
        for t in (0.16, 0.84):
            z = z0 + (z1 - z0) * t
            nrm = Vector((math.cos(a), math.sin(a), 0))
            join_bm(obj, rivet(polar(a, r, z), nrm, 0.011))


def torus(major, minor, maj=18, minor_seg=8):
    bm = bmesh.new()
    rings = []
    for i in range(maj):
        a = i / maj * math.tau
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for j in range(minor_seg):
            b = j / minor_seg * math.tau
            cb, sb = math.cos(b), math.sin(b)
            ring.append(bm.verts.new(((major + minor * cb) * ca, (major + minor * cb) * sa, minor * sb)))
        rings.append(ring)
    for i in range(maj):
        for j in range(minor_seg):
            i2, j2 = (i + 1) % maj, (j + 1) % minor_seg
            try:
                bm.faces.new((rings[i][j], rings[i][j2], rings[i2][j2], rings[i2][j]))
            except ValueError:
                pass
    return bm


def place_torus(major, minor, angle, r, z):
    bm = torus(major, minor)
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    q = Vector((0, 0, 1)).rotation_difference(radial)
    M = q.to_matrix().to_4x4()
    M.translation = polar(angle, r, z)
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=M)
    return bm


def disc(radius, segs=14):
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0))
    ring = []
    for i in range(segs):
        a = i / segs * math.tau
        ring.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, 0)))
    for i in range(segs):
        bm.faces.new((c, ring[i], ring[(i + 1) % segs]))
    return bm


def place_disc(radius, angle, r, z, nudge=0.0):
    bm = disc(radius)
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    q = Vector((0, 0, 1)).rotation_difference(radial)
    M = q.to_matrix().to_4x4()
    M.translation = polar(angle, r, z) + radial * nudge
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=M)
    return bm


# --- build -----------------------------------------------------------------

def build():
    reset()
    print("build core / nose / collar / band")
    core = lathe("core", [
        (0.05, 0.50), (0.28, 0.56), (CORE_R, 0.78), (CORE_R, 1.55),
        (0.36, 1.85), (0.26, 2.05), (0.12, 2.16), (0.02, 2.20),
    ], 24)
    bevel(core, 0.02, 2, sub=0)
    tag(core, "core", "fn:core")

    # Pilot sits in the cavity, just outside the core skin, behind the windows.
    pilot_a, pilot_z, pilot_r = -math.pi / 2, 1.62, 0.48
    head_c = polar(pilot_a, pilot_r, pilot_z + 0.05)
    suit = lathe("_suit", [(0.045, -0.06), (0.055, 0.02), (0.04, 0.07), (0.02, 0.09)], 12)
    bevel(suit, 0.008, 1, sub=0)
    suit.location = polar(pilot_a, pilot_r, pilot_z - 0.02)
    # location transform must be baked
    bake_loc(suit)
    tag(suit, "core", "cream")
    head = sphere("_head", head_c, 0.055, (1, 1, 0.92))
    tag(head, "core", "skin")
    helm = sphere("_helm", head_c + Vector((0, 0, 0.01)), 0.072, (1.05, 1.05, 1.0))
    tag(helm, "core", "cream")
    visor = sphere("_visor", head_c + Vector((math.cos(pilot_a) * 0.04, math.sin(pilot_a) * 0.04, 0.01)), 0.04, (1.3, 0.7, 0.8))
    tag(visor, "core", "sky")

    # Skirt flares outside the collar so the collar screws sit under the nose.
    nose = lathe("nose", [
        (0.02, 2.98), (0.10, 2.88), (0.22, 2.70), (0.36, 2.50),
        (0.48, 2.32), (0.58, 2.22), (0.72, 2.14), (0.80, 2.08), (0.74, 2.00),
    ], 28)
    bevel(nose, 0.014, 2, sub=0)
    star = star_bm(0.09)
    M = Matrix.Translation(polar(-math.pi / 2, 0.34, 2.58))
    bmesh.ops.transform(star, verts=list(star.verts), matrix=M)
    join_bm(nose, star)
    for ang in (-0.85, 0.0, 0.85):
        a = -math.pi / 2 + ang
        nrm = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.84))
        pos = polar(a, 0.40, 2.48)
        seat_screw(nose, "nose", pos, nrm, w=0.07, h=0.06, thick=0.035)
    register(nose, "nose", space="body", layer=2, sectors=list(range(8)), rings=[4],
             fall=Vector((0, -0.15, 1.25)), cell=0.42, paint="red")

    collar = lathe("collar", [
        (0.42, 1.98), (0.56, 2.02), (0.62, 2.08), (0.56, 2.14), (0.42, 2.18), (0.40, 2.08),
    ], 24)
    bevel(collar, 0.012, 2, sub=0)
    for deg in (-90, 30, 150):
        a = math.radians(deg)
        radial = Vector((math.cos(a), math.sin(a), 0))
        tangent = Vector((-math.sin(a), math.cos(a), 0))
        seat_screw(collar, "collar", polar(a, 0.645, 2.08), radial, tangent,
                   w=0.08, h=0.06, thick=0.04)
    register(collar, "collar", space="body", layer=2, sectors=list(range(8)), rings=[3],
             fall=outward(range(8), 0.7, 0.4), cell=0.36, paint="yellow")

    # Fairing dropped over the panel seam. Inner lip stays outside the shells
    # (panel outer is 0.70) so the two meshes do not intersect.
    band = lathe("band", [
        (0.78, 1.02), (0.90, 1.14), (0.98, 1.26), (1.00, 1.34),
        (0.98, 1.42), (0.88, 1.50), (0.78, 1.56),
    ], 28)
    bevel(band, 0.012, 2, sub=0)
    for deg in (-90, 70, 200):
        a = math.radians(deg)
        radial = Vector((math.cos(a), math.sin(a), 0))
        tangent = Vector((-math.sin(a), math.cos(a), 0))
        seat_screw(band, "band", polar(a, 1.025, 1.34), radial, tangent,
                   w=0.08, h=0.06, thick=0.045)
    for a_i in range(12):
        a = a_i / 12 * math.tau + 0.13
        join_bm(band, rivet(polar(a, 0.99, 1.34), Vector((math.cos(a), math.sin(a), 0)), 0.012))
    register(band, "band", space="body", layer=2, sectors=list(range(8)), rings=[1, 2],
             fall=Vector((0, -0.2, 0.85)), cell=0.32, paint="orange")

    print("build panels")
    panel_defs = [
        ("up0", 1, [7, 0], (1.32, 1.90)),
        ("up1", 1, [1, 2], (1.32, 1.90)),
        ("up2", 1, [3, 4], (1.32, 1.90)),
        ("up3", 1, [5, 6], (1.32, 1.90)),
        ("lo0", 1, [7, 0], (0.42, 1.18)),
        ("lo1", 1, [1, 2], (0.66, 1.18)),
        ("lo2", 1, [3, 4], (0.66, 1.18)),
        ("lo3", 1, [5, 6], (0.66, 1.18)),
    ]
    panel_colors = {
        "up0": "sky", "up1": "lime", "up2": "purple", "up3": "pink",
        "lo0": "teal", "lo1": "royal", "lo2": "red", "lo3": "yellow",
    }
    rings_of = {
        "up0": [2], "up1": [2], "up2": [2], "up3": [2],
        "lo0": [0, 1], "lo1": [1], "lo2": [1], "lo3": [1],
    }
    for pid, layer, sectors, (z0, z1) in panel_defs:
        a0, a1 = cover_angles(sectors, gap=0.10)
        obj = arc_shell(pid, z0, z1, a0, a1, PANEL_R0, PANEL_R1, na=8, nz=5)
        if pid == "up0":
            cut_hole(obj, math.radians(-106), 1.62, 0.125)
            cut_hole(obj, math.radians(-74), 1.62, 0.125)
        bevel(obj, 0.016, 2, sub=0)
        add_rivet_row(obj, a0, a1, z0, z1, PANEL_R1 - 0.004, n=3)
        # One screw tucked under the orange fairing, one left in the open.
        # up0's middle screw sits under the left porthole tab.
        if pid == "up0":
            spots = (
                (math.radians(-140), 1.38),
                (UP0_PORT_A, 1.62),
                (math.radians(-50), 1.78),
            )
        elif z1 > 1.5:
            mid = (a0 + a1) * 0.5
            spots = ((steer_clear(mid - 0.28), 1.38), (steer_clear(mid + 0.28), 1.76))
        else:
            mid = (a0 + a1) * 0.5
            spots = (
                (steer_clear(mid - 0.28), 1.10),
                (steer_clear(mid + 0.28), 0.72 if pid == "lo0" else 0.80),
            )
        for ang, z in spots:
            radial = Vector((math.cos(ang), math.sin(ang), 0))
            tangent = Vector((-math.sin(ang), math.cos(ang), 0))
            seat_screw(obj, pid, polar(ang, PANEL_R1 + 0.006, z), radial, tangent,
                       w=0.08, h=0.06, thick=0.04)
        register(obj, pid, space="body", layer=layer, sectors=sectors, rings=rings_of[pid],
                 fall=outward(sectors, 0.35, 1.25), cell=0.50, paint=panel_colors[pid])

    print("build portholes, nozzle, fins, boosters")
    for pid, ang, col, tab in (
        ("portL", PORT_L_A, "pink", True),
        ("portR", PORT_R_A, "lime", False),
    ):
        center = polar(ang, 0.74, 1.62)
        obj = to_mesh(place_torus(0.090, 0.020, ang, 0.74, 1.62), pid, flip_check=False)
        join_bm(obj, place_disc(0.068, ang, 0.71, 1.62, 0.0))
        radial = Vector((math.cos(ang), math.sin(ang), 0))
        tangent = Vector((-math.sin(ang), math.cos(ang), 0))
        for side in (-1, 1):
            pos = center + tangent * (0.108 * side) + radial * 0.028
            seat_screw(obj, pid, pos, radial, Vector((0, 0, 1)), w=0.05, h=0.05, thick=0.035)
        if tab:
            tr = Vector((math.cos(UP0_PORT_A), math.sin(UP0_PORT_A), 0))
            tt = Vector((-math.sin(UP0_PORT_A), math.cos(UP0_PORT_A), 0))
            add_box(obj, tr * 0.835 + Vector((0, 0, 1.62)), tr * 0.07, tt * 0.20, Vector((0, 0, 0.20)))
        smooth(obj)
        register(obj, pid, space="body", layer=2, sectors=[0], rings=[2],
                 fall=outward([0], 0.4, 1.3), cell=0.24, paint=col)

    nozzle = lathe("nozzle", [
        (0.04, 0.50), (0.18, 0.46), (0.22, 0.34), (0.32, 0.18),
        (0.44, 0.06), (0.34, 0.02), (0.20, 0.10), (0.12, 0.30), (0.06, 0.46),
    ], 20)
    bevel(nozzle, 0.012, 2, sub=0)
    # Two fasteners on the neck, inside the front lower shell.
    for deg in (-120, -80):
        a = math.radians(deg)
        nrm = Vector((math.cos(a), math.sin(a), 0.12))
        seat_screw(nozzle, "nozzle", polar(a, 0.20, 0.46), nrm, w=0.06, h=0.05, thick=0.04)
    register(nozzle, "nozzle", space="body", layer=0, sectors=[7, 0], rings=[0],
             fall=Vector((0, -0.15, -0.9)), cell=0.40, paint="royal")

    # fin0 sits beside the right booster, fin2 beside the left. The sole of
    # each covers that booster's mount screws. fin1 is a plain blade.
    fin_defs = (
        ("fin0", 0.30, 2, "green", True),
        ("fin1", sector_center(3), 3, "sky", False),
        ("fin2", math.pi - 0.30, 6, "purple", True),
    )
    for pid, ang, sec, col, sole in fin_defs:
        obj = fin_mesh(pid, ang)
        bevel(obj, 0.012, 2, sub=0)
        radial = Vector((math.cos(ang), math.sin(ang), 0))
        tangent = Vector((-math.sin(ang), math.cos(ang), 0))
        if sole:
            add_box(obj, radial * 1.04 + Vector((0, 0, 0.62)),
                    radial * 0.36, tangent * 0.22, Vector((0, 0, 0.08)))
        # Outer tip and top edge, aimed out so the ray does not hit the booster.
        seat_screw(obj, pid, radial * 1.28 + Vector((0, 0, 0.72)), radial, tangent,
                   w=0.06, h=0.05, thick=0.04)
        seat_screw(obj, pid, radial * 1.08 + Vector((0, 0, 0.98)),
                   (radial * 0.20 + Vector((0, 0, 1))).normalized(), tangent,
                   w=0.06, h=0.05, thick=0.035)
        register(obj, pid, space="body", layer=2, sectors=[sec], rings=[0],
                 fall=outward([sec], 0.3, 1.35), cell=0.40, paint=col)

    for pid, sec, col, fin_ang in (
        ("boostR", 2, "pink", 0.30),
        ("boostL", 6, "teal", math.pi - 0.30),
    ):
        a = sector_center(sec)
        obj = booster_mesh(pid, a)
        add_booster_ear(obj, fin_ang, a, pid)
        register(obj, pid, space="body", layer=2, sectors=[sec], rings=[1],
                 fall=outward([sec], 0.35, 1.3), cell=0.46, paint=col)

    print("build antenna, dish, flag, pad")
    ant_a = sector_center(2)
    antenna = antenna_mesh("antenna", ant_a)
    ar = Vector((math.cos(ant_a), math.sin(ant_a), 0))
    at = Vector((-math.sin(ant_a), math.cos(ant_a), 0))
    foot = ar * 0.90 + Vector((0, 0, 1.90))
    add_box(antenna, foot, ar * 0.14, at * 0.18, Vector((0, 0, 0.08)))
    for side in (-1, 1):
        add_screw("antenna", foot + Vector((0, 0, 0.04)) + at * (0.05 * side), Vector((0, 0, 1)))
    register(antenna, "antenna", space="body", layer=2, sectors=[2], rings=[3],
             fall=outward([2], 0.8, 1.1), cell=0.30, paint="royal")

    dish_a = sector_center(4)
    dish = dish_mesh("dish", dish_a)
    radial = Vector((math.cos(dish_a), math.sin(dish_a), 0))
    tangent = Vector((-math.sin(dish_a), math.cos(dish_a), 0))
    plate = radial * 0.78 + Vector((0, 0, 1.62))
    add_box(dish, plate, radial * 0.12, tangent * 0.16, Vector((0, 0, 0.18)))
    for dz in (0.055, -0.055):
        add_screw("dish", plate + radial * 0.06 + Vector((0, 0, dz)), radial)
    register(dish, "dish", space="body", layer=2, sectors=[4], rings=[2],
             fall=outward([4], 0.4, 1.3), cell=0.28, paint="green")

    flag = flag_mesh("flag")
    for z in (0.34, 0.66):
        seat_screw(flag, "flag", Vector((-0.55, -1.00, z)), Vector((0, -1, 0)), Vector((1, 0, 0)),
                   w=0.06, h=0.055, thick=0.07)
    register(flag, "flag", space="pad", layer=None, sectors=[], rings=[],
             fall=Vector((-0.4, -0.8, 0.4)), cell=0.32, paint="fn:flag")

    pad = lathe("static_pad", [
        (0.02, 0.16), (0.9, 0.155), (1.22, 0.145), (1.34, 0.10),
        (1.40, 0.02), (1.36, -0.10), (1.20, -0.18), (0.02, -0.18),
    ], 32)
    bevel(pad, 0.02, 2, sub=0)
    tag(pad, "static", "fn:pad")

    build_diorama()
    build_trim_and_props()


def bake_loc(obj):
    if obj.location.length < 1e-8 and obj.rotation_euler.length < 1e-8:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=obj.matrix_world.copy())
    bm.to_mesh(obj.data)
    bm.free()
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.data.update()


def sphere(name, loc, radius, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=radius)
    bmesh.ops.scale(bm, verts=list(bm.verts), vec=Vector(scale))
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=Vector(loc))
    obj = to_mesh(bm, name)
    smooth(obj)
    return obj


def star_bm(radius):
    bm = bmesh.new()
    verts = []
    for i in range(10):
        r = radius if i % 2 == 0 else radius * 0.42
        a = -math.pi / 2 + i / 10 * math.tau
        verts.append(bm.verts.new((math.sin(a) * r, -0.01, math.cos(a) * r)))
    c0 = bm.verts.new((0, -0.01, 0))
    c1 = bm.verts.new((0, 0.025, 0))
    for i in range(10):
        j = (i + 1) % 10
        try:
            bm.faces.new((c0, verts[j], verts[i]))
            bm.faces.new((c1, verts[i], verts[j]))
            bm.faces.new((verts[i], verts[j], c1, c0))
        except ValueError:
            pass
    return bm


def add_booster_ear(obj, fin_angle, boost_angle, pid):
    """Mount tab beside the booster. The neighboring fin's sole covers it."""
    radial = Vector((math.cos(fin_angle), math.sin(fin_angle), 0))
    tangent = Vector((-math.sin(fin_angle), math.cos(fin_angle), 0))
    add_box(obj, radial * 1.04 + Vector((0, 0, 0.44)),
            radial * 0.30, tangent * 0.16, Vector((0, 0, 0.12)))
    mid = math.atan2(math.sin(fin_angle) + math.sin(boost_angle),
                     math.cos(fin_angle) + math.cos(boost_angle))
    mr = Vector((math.cos(mid), math.sin(mid), 0))
    mt = Vector((-math.sin(mid), math.cos(mid), 0))
    add_box(obj, mr * 1.16 + Vector((0, 0, 0.46)),
            mr * 0.18, mt * 0.08, Vector((0, 0, 0.10)))
    for rad in (0.96, 1.12):
        add_screw(pid, radial * rad + Vector((0, 0, 0.50)), Vector((0, 0, 1)))


def fin_mesh(name, angle):
    # Root sits above the booster ear so the sole, not the blade, is the cover.
    pts = [(0.84, 0.66), (1.26, 0.58), (1.32, 0.84), (1.06, 1.00), (0.84, 0.82)]
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    tangent = Vector((-math.sin(angle), math.cos(angle), 0))
    bm = bmesh.new()
    rings = []
    for side in (-0.045, 0.045):
        ring = [bm.verts.new(radial * rad + tangent * side + Vector((0, 0, z))) for rad, z in pts]
        rings.append(ring)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        except ValueError:
            pass
    try:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[1])))
    except ValueError:
        pass
    obj = to_mesh(bm, name)
    smooth(obj)
    return obj


def booster_mesh(name, angle):
    obj = lathe(name, [
        (0.04, 0.52), (0.12, 0.58), (0.16, 0.72), (0.16, 1.05),
        (0.11, 1.14), (0.04, 1.18),
    ], 16)
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=radial * 1.18)
    # little nozzle
    for i, (r, z) in enumerate([(0.08, 0.58), (0.12, 0.50), (0.06, 0.48)]):
        pass
    bm.to_mesh(obj.data)
    bm.free()
    bevel(obj, 0.012, 2, sub=0)
    cap = lathe("_bcap", [(0.02, 0.0), (0.10, 0.02), (0.14, 0.08), (0.08, 0.12), (0.02, 0.14)], 16)
    bake_shift = radial * 1.18 + Vector((0, 0, 0.46))
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=bake_shift)
    bm.to_mesh(cap.data)
    bm.free()
    obj2 = fuse(name, [obj, cap])
    smooth(obj2)
    return obj2


def antenna_mesh(name, angle):
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    bm = bmesh.new()
    rings = []
    for z, r in ((1.92, 0.035), (2.15, 0.028), (2.32, 0.02), (2.48, 0.055), (2.56, 0.02)):
        ring = []
        for i in range(10):
            a = i / 10 * math.tau
            off = Vector((math.cos(a) * r, math.sin(a) * r, 0))
            # orient the radius in the plane perpendicular to Z, then put on the mast
            ring.append(bm.verts.new(radial * 0.84 + Vector((0, 0, z)) + off))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(10):
            j2 = (j + 1) % 10
            try:
                bm.faces.new((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]))
            except ValueError:
                pass
    obj = to_mesh(bm, name, flip_check=False)
    smooth(obj)
    return obj


def dish_mesh(name, angle):
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    obj = lathe(name, [
        (0.02, 0.0), (0.06, 0.02), (0.12, 0.06), (0.16, 0.12), (0.10, 0.14), (0.02, 0.08),
    ], 16)
    q = Vector((0, 0, 1)).rotation_difference(radial)
    M = q.to_matrix().to_4x4()
    M.translation = radial * 0.86 + Vector((0, 0, 1.62))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=M)
    bm.to_mesh(obj.data)
    bm.free()
    smooth(obj)
    return obj


def flag_mesh(name):
    # Pole near the front-left of the pad, cloth toward -X.
    bm = bmesh.new()
    rings = []
    for z in (0.18, 0.78):
        ring = []
        for i in range(8):
            a = i / 8 * math.tau
            ring.append(bm.verts.new((-0.55 + math.cos(a) * 0.02, -0.95 + math.sin(a) * 0.02, z)))
        rings.append(ring)
    for j in range(8):
        j2 = (j + 1) % 8
        bm.faces.new((rings[0][j], rings[0][j2], rings[1][j2], rings[1][j]))
    # cloth
    cloth = [
        (-0.55, -0.95, 0.62), (-0.28, -0.98, 0.64), (-0.30, -1.02, 0.50), (-0.55, -0.95, 0.48),
    ]
    vs = [bm.verts.new(p) for p in cloth]
    vs2 = [bm.verts.new((p[0], p[1] - 0.012, p[2])) for p in cloth]
    bm.faces.new(vs)
    bm.faces.new(list(reversed(vs2)))
    obj = to_mesh(bm, name, flip_check=False)
    smooth(obj)
    return obj


def build_diorama():
    # Grass tufts, flowers, rocks, mascot, rim domes. All static.
    bm = bmesh.new()
    rng = random.Random(7)
    for i in range(14):
        a = i / 14 * math.tau + 0.2
        r = 1.48 + (i % 3) * 0.06
        base = polar(a, r, 0.16)
        for k in range(4):
            lean = Vector((math.cos(a + k), math.sin(a + k), 0)).normalized() * 0.02
            h = 0.10 + (k % 2) * 0.04
            w = 0.018
            p0 = base + Vector((math.cos(a + 1.2) * w, math.sin(a + 1.2) * w, 0))
            p1 = base - Vector((math.cos(a + 1.2) * w, math.sin(a + 1.2) * w, 0))
            p2 = base + lean + Vector((0, 0, h))
            p3 = p2 + Vector((w, 0, 0))
            vs = [bm.verts.new(p) for p in (p0, p1, p2, p3)]
            try:
                bm.faces.new((vs[0], vs[1], vs[2]))
                bm.faces.new((vs[0], vs[2], vs[3]))
            except ValueError:
                pass
    grass = to_mesh(bm, "static_grass", flip_check=False)
    tag(grass, "static", "green")

    bm = bmesh.new()
    centers = []
    petals_cols = ["pink", "red", "yellow", "sky", "orange", "purple", "lime", "royal"]
    for i, col in enumerate(petals_cols):
        a = i / 8 * math.tau + 0.4
        c = polar(a, 1.55, 0.18)
        centers.append((c, col))
        for k in range(5):
            pa = k / 5 * math.tau
            off = Vector((math.cos(pa) * 0.045, math.sin(pa) * 0.045, 0.03))
            bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.032,
                                      matrix=Matrix.Translation(c + off))
        bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.022,
                                  matrix=Matrix.Translation(c + Vector((0, 0, 0.05))))
    flowers = to_mesh(bm, "static_flowers", flip_check=False)
    smooth(flowers)
    flowers["centers"] = "ok"
    PAINT_FLOWERS = centers
    tag(flowers, "static", ("flowers", centers))

    bm = bmesh.new()
    for i, (a, r, s) in enumerate(((0.4, 1.62, 0.07), (2.2, 1.58, 0.05), (3.6, 1.66, 0.06), (5.1, 1.6, 0.045))):
        M = Matrix.Translation(polar(a, r, 0.18)) @ Matrix.Diagonal((1.3, 1.0, 0.6, 1))
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s, matrix=M)
    rocks = to_mesh(bm, "static_rocks", flip_check=False)
    smooth(rocks)
    tag(rocks, "static", "stone")

    # Rim domes sit on the side arcs, between the two removable gold trims.
    bm = bmesh.new()
    for deg in (0, 28, 152, 180, 208, -28):
        a = math.radians(deg)
        M = Matrix.Translation(polar(a, 1.26, 0.17)) @ Matrix.Diagonal((1, 1, 0.45, 1))
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.032, matrix=M)
    domes = to_mesh(bm, "static_domes", flip_check=False)
    smooth(domes)
    tag(domes, "static", "yellow")

    build_mascot()


def build_mascot():
    base = Vector((0.62, -0.82, 0.18))
    parts = []
    body = sphere("static_m_body", base + Vector((0, 0, 0.16)), 0.07, (0.85, 0.7, 1.15))
    parts.append(tag(body, "static", "pink"))
    pack = sphere("static_m_pack", base + Vector((-0.02, 0.06, 0.17)), 0.045, (0.7, 0.9, 1.1))
    parts.append(tag(pack, "static", "royal"))
    head_c = base + Vector((0, -0.01, 0.30))
    head = sphere("static_m_head", head_c, 0.055, (1, 0.95, 0.9))
    parts.append(tag(head, "static", "skin"))
    helm = sphere("static_m_helm", head_c + Vector((0, 0, 0.01)), 0.072, (1.05, 1.05, 1))
    parts.append(tag(helm, "static", "cream"))
    vis = sphere("static_m_vis", head_c + Vector((0, -0.045, 0.01)), 0.038, (1.2, 0.55, 0.75))
    parts.append(tag(vis, "static", "sky"))
    arm = sphere("static_m_arm", base + Vector((0.07, -0.02, 0.28)), 0.028, (0.55, 0.55, 1.4))
    parts.append(tag(arm, "static", "cream"))
    for sx in (-0.03, 0.03):
        leg = sphere(f"static_m_leg{sx}", base + Vector((sx, 0, 0.06)), 0.028, (0.7, 0.7, 1.3))
        parts.append(tag(leg, "static", "sky"))
        boot = sphere(f"static_m_boot{sx}", base + Vector((sx, -0.01, 0.02)), 0.026, (1.1, 0.8, 0.7))
        parts.append(tag(boot, "static", "yellow"))
    # keep as separate objects; UVs written per object, then merged into static


def build_trim_and_props():
    # Two gold ring halves. Their screws are the gameplay half of the rim.
    for pid, center_deg in (("trimF", -90), ("trimB", 90)):
        a_c = math.radians(center_deg)
        obj = arc_shell(pid, 0.155, 0.21, a_c - 0.55, a_c + 0.55, 1.18, 1.32, na=10, nz=2)
        bevel(obj, 0.01, 2, sub=0)
        for k in (-1, 1):
            a = a_c + k * 0.40
            tangent = Vector((-math.sin(a), math.cos(a), 0))
            seat_screw(obj, pid, polar(a, 1.26, 0.225), Vector((0, 0, 1)), tangent,
                       w=0.08, h=0.05, thick=0.04)
        register(obj, pid, space="pad", layer=None, sectors=[], rings=[],
                 fall=Vector((math.cos(a_c) * 0.8, math.sin(a_c) * 0.8, 0.35)),
                 cell=0.30, paint="pink" if pid == "trimF" else "yellow")

    # Ladder, gantry + arm, cans, sign.
    ladder = box_bar("ladder", Vector((-0.95, -0.72, 0.18)), Vector((-0.82, -0.55, 0.95)))
    # rungs
    bm = bmesh.new()
    bm.from_mesh(ladder.data)
    for i in range(4):
        z = 0.32 + i * 0.14
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(Vector((-0.88, -0.63, z))) @ Matrix.Scale(0.12, 4, Vector((1, 0, 0))) @ Matrix.Scale(0.02, 4, Vector((0, 1, 0))) @ Matrix.Scale(0.02, 4, Vector((0, 0, 1))))
    bm.to_mesh(ladder.data)
    bm.free()
    bevel(ladder, 0.008, 1, sub=0)
    add_screw("ladder", Vector((-0.95, -0.70, 0.40)), Vector((-0.2, -1, 0)))
    add_screw("ladder", Vector((-0.86, -0.58, 0.78)), Vector((-0.2, -1, 0.1)))
    register(ladder, "ladder", space="pad", layer=None, sectors=[], rings=[],
             fall=Vector((-0.7, -0.6, 0.3)), cell=0.34, paint="green")

    post = box_bar("gantry", Vector((0.95, 0.85, 0.18)), Vector((1.13, 1.03, 1.25)))
    bevel(post, 0.01, 2, sub=0)
    add_screw("gantry", Vector((0.98, 1.05, 0.48)), Vector((0, 1, 0)))
    add_screw("gantry", Vector((1.10, 1.05, 0.96)), Vector((0, 1, 0)))
    register(post, "gantry", space="pad", layer=0, sectors=[0], rings=[0],
             fall=Vector((0.7, 0.7, 0.4)), cell=0.40, paint="royal")

    arm = box_bar("arm", Vector((0.55, 0.90, 1.12)), Vector((1.05, 1.02, 1.24)))
    bevel(arm, 0.008, 1, sub=0)
    add_screw("arm", Vector((0.70, 0.96, 1.24)), Vector((0, 0.2, 1)))
    add_screw("arm", Vector((0.92, 0.96, 1.24)), Vector((0, 0.2, 1)))
    register(arm, "arm", space="pad", layer=1, sectors=[0], rings=[0],
             fall=Vector((0.2, 0.4, 0.7)), cell=0.36, paint="yellow")

    for pid, loc, col in (
        ("canA", Vector((0.85, -0.35, 0.18)), "orange"),
        ("canB", Vector((1.02, -0.12, 0.18)), "pink"),
    ):
        obj = lathe(pid, [(0.07, 0), (0.08, 0.04), (0.08, 0.22), (0.05, 0.28), (0.02, 0.30)], 12)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.translate(bm, verts=list(bm.verts), vec=loc)
        bm.to_mesh(obj.data)
        bm.free()
        bevel(obj, 0.006, 1, sub=0)
        top = loc + Vector((0, 0, 0.30))
        add_pad(obj, top, Vector((0, 0, 1)), Vector((1, 0, 0)), w=0.06, h=0.06, thick=0.035)
        add_screw(pid, top, Vector((0, 0, 1)))
        if pid == "canA":
            front = loc + Vector((0, -0.085, 0.14))
            seat_screw(obj, pid, front, Vector((0, -1, 0)), Vector((1, 0, 0)),
                       w=0.05, h=0.05, thick=0.04)
        register(obj, pid, space="pad", layer=None, sectors=[], rings=[],
                 fall=Vector((loc.x, loc.y, 0.4)), cell=0.28, paint=col)

    sign = box_bar("sign", Vector((-0.18, -1.02, 0.18)), Vector((0.18, -0.90, 0.42)))
    star = star_bm(0.07)
    M = Matrix.Translation(Vector((0, -1.02, 0.30)))
    bmesh.ops.transform(star, verts=list(star.verts), matrix=M)
    join_bm(sign, star)
    bevel(sign, 0.008, 1, sub=0)
    add_screw("sign", Vector((-0.12, -1.04, 0.22)), Vector((0, -1, 0)))
    add_screw("sign", Vector((0.12, -1.04, 0.36)), Vector((0, -1, 0)))
    register(sign, "sign", space="pad", layer=None, sectors=[], rings=[],
             fall=Vector((0, -0.8, 0.35)), cell=0.32, paint="fn:sign")


def box_bar(name, mn, mx):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    sx, sy, sz = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    c = (mn + mx) * 0.5
    M = Matrix.Translation(c) @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.transform(bm, verts=list(bm.verts), matrix=M)
    return to_mesh(bm, name)


# --- puzzle ----------------------------------------------------------------

def ring_close(a, b):
    if not a or not b:
        return False
    return any(abs(x - y) <= 1 for x in a for y in b)


def sector_touch(a, b):
    if not a or not b:
        return False
    A, B = set(a), set(b)
    if A & B:
        return True
    for s in A:
        if (s + 1) % NSECTOR in B:
            return True
    return False


def adjacent(a, b):
    if a["space"] != b["space"]:
        return False
    if a["layer"] is None or b["layer"] is None:
        return False
    if not ring_close(a["rings"], b["rings"]):
        return False
    if not sector_touch(a["sectors"], b["sectors"]):
        return False
    if a["layer"] == b["layer"]:
        return True
    return abs(a["layer"] - b["layer"]) == 1 and bool(set(a["sectors"]) & set(b["sectors"]))


def derive_blocks():
    for a in PARTS:
        a["blocks"] = []
    for a in PARTS:
        if a["layer"] is None:
            continue
        for b in PARTS:
            if a is b or b["layer"] is None or a["space"] != b["space"]:
                continue
            if a["layer"] != b["layer"] + 1:
                continue
            if not (set(a["sectors"]) & set(b["sectors"])):
                continue
            if not (set(a["rings"]) & set(b["rings"])):
                continue
            a["blocks"].append(b["id"])


def assign_colors():
    names = [n for n, _ in PALETTE]
    for p in PARTS:
        paint = PAINT.get(p["id"])
        if isinstance(paint, str) and paint in PALETTE_I:
            p["color"] = paint
        else:
            p["color"] = "cream"
    changed = True
    guard = 0
    while changed and guard < 40:
        changed = False
        guard += 1
        ordered = sorted(PARTS, key=lambda p: sum(1 for q in PARTS if adjacent(p, q)))
        for a in ordered:
            bad = {b["color"] for b in PARTS if b is not a and adjacent(a, b)}
            if a["color"] in bad:
                for n in names:
                    if n not in bad and n not in ("cream", "skin", "stone"):
                        a["color"] = n
                        PAINT[a["id"]] = n
                        changed = True
                        break
    clashes = []
    for i, a in enumerate(PARTS):
        for b in PARTS[i + 1:]:
            if adjacent(a, b) and a["color"] == b["color"]:
                clashes.append((a["id"], b["id"], a["color"]))
    if clashes:
        raise SystemExit("adjacent color clash " + str(clashes))


def color_cycle(phase):
    n = len(SCREW_COLORS)
    return [SCREW_COLORS[(i + phase) % n] for i in range(n)]


def opening_and_queue(cycle):
    # Four boxes on screen. Clearing one brings the color four steps ahead,
    # so a group of three always lands in a box that is already open.
    opening = cycle[:NBOX]
    queue = (cycle[NBOX:] + cycle * 8)[:32]
    return opening, queue


def build_solution():
    by_id = {p["id"]: p for p in PARTS}
    index_by_part = {}
    for i, s in enumerate(SCREWS):
        index_by_part.setdefault(s["part"], []).append(i)

    def attempt(phase, salt):
        rng = random.Random(phase * 97 + salt * 13 + 5)
        remaining = {pid: set(ixs) for pid, ixs in index_by_part.items()}
        done = set()
        order = []

        def priority(ix):
            s = SCREWS[ix]
            p = by_id[s["part"]]
            space = 0 if p["space"] == "body" else 1
            layer = -(p["layer"] if p["layer"] is not None else -1)
            # Peel uncovered screws first so a cover comes off before the
            # fastener it hides.
            return (len(s["coveredBy"]), space, layer, len(remaining[s["part"]]), s["part"], ix)

        n = len(SCREWS)
        if n % 3:
            return None
        for gi in range(n // 3):
            color = SCREW_COLORS[(gi + phase) % len(SCREW_COLORS)]
            for _ in range(3):
                cands = []
                for pid, ixs in remaining.items():
                    if color in FORBID.get(by_id[pid]["color"], ()):
                        continue
                    for ix in ixs:
                        if all(b in done for b in SCREWS[ix]["coveredBy"]):
                            cands.append(ix)
                if not cands:
                    return None
                cands.sort(key=priority)
                pick = cands[0] if salt == 0 else cands[rng.randrange(min(3, len(cands)))]
                order.append(pick)
                pid = SCREWS[pick]["part"]
                remaining[pid].remove(pick)
                if not remaining[pid]:
                    done.add(pid)
                SCREWS[pick]["color"] = color
        return order

    for salt in range(16):
        for phase in range(len(SCREW_COLORS)):
            order = attempt(phase, salt)
            if order:
                print("solution phase", phase, "salt", salt)
                return order, phase
    return None, 0


def verify(order, phase):
    cycle = color_cycle(phase)
    opening, queue = opening_and_queue(cycle)
    queue = queue[:]
    screws_of = {p["id"]: [] for p in PARTS}
    for i, s in enumerate(SCREWS):
        screws_of[s["part"]].append(i)
    removed = [False] * len(SCREWS)
    boxes = [{"color": c, "n": 0} for c in opening]

    def alive(pid):
        return any(not removed[i] for i in screws_of[pid])

    def blocked(i):
        return any(alive(b) for b in SCREWS[i].get("coveredBy") or [])

    for step, i in enumerate(order):
        if removed[i] or blocked(i):
            raise SystemExit(f"illegal move {step} screw {i}")
        color = SCREWS[i]["color"]
        box = next((b for b in boxes if b and b["color"] == color and b["n"] < 3), None)
        if box:
            box["n"] += 1
        else:
            raise SystemExit(f"no box for {color} at {step}")
        removed[i] = True
        changed = True
        while changed:
            changed = False
            for k, b in enumerate(boxes):
                if b and b["n"] >= 3:
                    boxes[k] = {"color": queue.pop(0), "n": 0} if queue else None
                    changed = True
    if not all(removed):
        raise SystemExit("solution did not finish")


def snap_screws():
    by_id = {p["id"]: p["obj"] for p in PARTS}
    bpy.context.view_layer.update()
    missed = 0
    for s in SCREWS:
        obj = by_id[s["part"]]
        hint = s["normal"].normalized()
        hit, loc, nor = _ray_surface(obj, s["pos"], hint)
        if not hit:
            missed += 1
            print("  miss", s["part"], [round(x, 3) for x in s["pos"]])
            continue
        nor = nor.normalized()
        # Face the side we aimed at. A bbox-center test flips screws on a
        # foot or a mount that sits off the part's middle.
        if nor.dot(hint) < 0:
            nor.negate()
        # Sit the shank base on the face. The axis is this surface normal,
        # including on the curved band where the hint was only a guess.
        s["pos"] = loc + nor * 0.003
        s["normal"] = nor
    print("screw snap misses", missed)
    if missed:
        raise SystemExit("screw snap missed " + str(missed))


def derive_covers():
    """A screw is blocked while a part still occupies the ray outside its cap."""
    for s in SCREWS:
        s["coveredBy"] = []
    for s in SCREWS:
        n = Vector(s["normal"]).normalized()
        d = s["diameter"]
        cap_tip = s["pos"] + n * (0.28 * d)
        origin = cap_tip + n * 0.70
        hits = []
        owner_space = next(q["space"] for q in PARTS if q["id"] == s["part"])
        for p in PARTS:
            if p["id"] == s["part"] or p["space"] != owner_space:
                continue
            hit, loc, _nor, _idx = p["obj"].ray_cast(origin, -n, distance=0.86)
            if not hit:
                continue
            along = (loc - cap_tip).dot(n)
            lateral = (loc - cap_tip) - n * along
            lat = lateral.length
            # Close enough to hide the cap. A part further up the same ray
            # (the waist band above a fin root) is not covering this screw.
            if along < 0.012 or along > 0.50:
                continue
            if lat > 0.14:
                continue
            if along > 0.34 and lat > 0.07:
                continue
            hits.append((along, p["id"]))
        hits.sort()
        for _along, pid in hits:
            if pid not in s["coveredBy"]:
                s["coveredBy"].append(pid)
    break_cover_cycles()
    by_id = {p["id"]: p for p in PARTS}
    for p in PARTS:
        p["blocks"] = []
    for s in SCREWS:
        for cid in s["coveredBy"]:
            blk = by_id[cid]["blocks"]
            if s["part"] not in blk:
                blk.append(s["part"])


def break_cover_cycles():
    required = {
        ("nose", "collar"),
        ("band", "up0"),
        ("portL", "up0"),
        ("lo0", "nozzle"),
        ("fin0", "boostR"),
        ("fin2", "boostL"),
    }
    guard = 0
    while guard < 8:
        guard += 1
        pair = {}
        for s in SCREWS:
            for c in s["coveredBy"]:
                pair.setdefault((c, s["part"]), []).append(s)
        dropped = False
        for (a, b), screws in list(pair.items()):
            if (b, a) not in pair:
                continue
            if (a, b) in required and (b, a) not in required:
                victims = pair[(b, a)]
                cover, owner = b, a
            else:
                victims = screws
                cover, owner = a, b
            for s in victims:
                if s["part"] == owner and cover in s["coveredBy"]:
                    s["coveredBy"].remove(cover)
                    print("drop cycle", cover, "over", s["part"])
                    dropped = True
            if dropped:
                break
        if not dropped:
            return
    raise SystemExit("cover cycles remain")


def assert_covers():
    def owners(cover):
        return [s["part"] for s in SCREWS if cover in (s.get("coveredBy") or [])]

    print("COVERS")
    for i, s in enumerate(SCREWS):
        if s["coveredBy"]:
            print(f"  {i} {s['part']} <- {s['coveredBy']}")
    counts = {}
    for s in SCREWS:
        counts[s["part"]] = counts.get(s["part"], 0) + 1
    print("SCREW COUNTS", counts)
    up0 = [i for i, s in enumerate(SCREWS) if s["part"] == "up0"]
    if not up0:
        raise SystemExit("no up0 screws")
    need = [
        ("nose", "collar"),
        ("band", "up0"),
        ("portL", "up0"),
        ("lo0", "nozzle"),
        ("fin0", "boostR"),
        ("fin2", "boostL"),
    ]
    missing = [f"{c}->{o}" for c, o in need if o not in owners(c)]
    if "band" not in SCREWS[up0[0]]["coveredBy"]:
        missing.append("first up0 screw not under band: " + str(SCREWS[up0[0]]["coveredBy"]))
    n = len(SCREWS)
    if n % 3 or n < 50:
        missing.append(f"screw count {n}")
    for pid, k in counts.items():
        if k < 1 or k > 4:
            missing.append(f"{pid} has {k} screws")
    if missing:
        raise SystemExit("cover check failed " + str(missing))


def _ray_surface(obj, pos, hint):
    origin = pos + hint * 0.5
    hit, loc, nor, _ = obj.ray_cast(origin, -hint, distance=1.2)
    if hit:
        return True, loc, nor
    axis = hint.cross(Vector((0, 0, 1)))
    if axis.length < 1e-4:
        axis = hint.cross(Vector((1, 0, 0)))
    axis.normalize()
    for ang in (0.35, -0.35, 0.7, -0.7, 1.1, -1.1):
        d = (hint * math.cos(ang) + axis * math.sin(ang)).normalized()
        hit, loc, nor, _ = obj.ray_cast(pos + d * 0.55, -d, distance=1.3)
        if hit:
            return True, loc, nor
    return False, pos, hint


def diameters():
    by_id = {p["id"]: p for p in PARTS}
    for s in SCREWS:
        edge = by_id[s["part"]]["cell"]
        s["diameter"] = round(min(0.16, max(0.055, 0.30 * edge)), 4)


# --- materials, uvs, bake, export ------------------------------------------

def paint_name(obj, co, normal):
    spec = PAINT.get(obj.name)
    if isinstance(spec, tuple) and spec and spec[0] == "flowers":
        best, bestd = "pink", 1e9
        for c, col in spec[1]:
            d = (co - c).length
            if d < bestd:
                bestd, best = d, col
        if bestd < 0.034:
            return "yellow"
        return best
    if spec == "fn:core":
        if co.z < 0.95:
            return "red"
        if co.z < 1.50:
            return "lime"
        return "sky"
    if spec == "fn:pad":
        r = math.hypot(co.x, co.y)
        if co.z > 0.08 and r < 1.18:
            return "yellow"
        if r > 1.18:
            return "pink"
        return "teal"
    if spec == "fn:flag":
        if co.x > -0.52 and co.z < 0.66:
            return "yellow"
        if co.z > 0.6 and co.x > -0.52:
            return "red"
        return "teal"
    if spec == "fn:sign":
        return "yellow" if co.z > 0.30 and abs(co.x) < 0.12 else "red"
    if isinstance(spec, str) and spec in PALETTE_I:
        return spec
    return "cream"


def write_palette(obj):
    me = obj.data
    if "Palette" not in me.uv_layers:
        me.uv_layers.new(name="Palette")
    uv = me.uv_layers["Palette"].data
    zs = [v.co.z for v in me.vertices] or [0, 1]
    z0, z1 = min(zs), max(zs)
    if z1 - z0 < 1e-4:
        z0, z1 = z0 - 0.05, z1 + 0.05
    n = len(PALETTE)
    me.calc_loop_triangles()
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            co = me.vertices[vi].co
            nor = me.vertices[vi].normal
            h = (co.z - z0) / (z1 - z0)
            # Stay in the saturated middle of the cell. A small lift toward
            # the light end fakes a top light without bleaching the hue.
            v = 0.38 + 0.22 * h + 0.16 * max(nor.z, 0.0)
            v = max(0.30, min(0.78, v))
            u = (PALETTE_I[paint_name(obj, co, nor)] + 0.5) / n
            uv[li].uv = (u, v)


def pack_bake(objs):
    items = []
    for o in objs:
        area = sum(p.area for p in o.data.polygons) or 1e-4
        items.append((area, o))
    items.sort(key=lambda t: -t[0])
    total = sum(a for a, _ in items)
    pad = 0.014
    x = y = row_h = 0.0
    placed = []
    for area, o in items:
        s = max(0.045, math.sqrt(area / total) * 0.92)
        if x + s > 1:
            x = 0
            y += row_h + pad
            row_h = 0
        placed.append((o, x, y, s))
        x += s + pad
        row_h = max(row_h, s)
    used = y + row_h
    if used > 0.98:
        k = 0.98 / used
        placed = [(o, px * k, py * k, s * k) for o, px, py, s in placed]
    for o, px, py, s in placed:
        write_object_bake(o, px, py, s)


def write_object_bake(obj, px, py, s):
    me = obj.data
    if "Bake" not in me.uv_layers:
        me.uv_layers.new(name="Bake")
    uv = me.uv_layers["Bake"].data
    groups = {i: [] for i in range(6)}
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        groups[ax if n[ax] >= 0 else ax + 3].append(poly)
    # 3 x 2 subcells
    slots = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)]
    for gi, polys in groups.items():
        if not polys:
            continue
        sx, sy = slots[gi]
        cell_x = px + s * (sx / 3 + 0.045)
        cell_y = py + s * (sy / 2 + 0.045)
        cell_w = s / 3 * 0.82
        cell_h = s / 2 * 0.82
        axis = gi % 3
        coords = []
        for poly in polys:
            for vi in poly.vertices:
                co = me.vertices[vi].co
                coords.append((co[(axis + 1) % 3], co[(axis + 2) % 3]))
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        minx, maxx = min(xs), max(xs)
        miny, maxy = min(ys), max(ys)
        dx = max(1e-6, maxx - minx)
        dy = max(1e-6, maxy - miny)
        for poly in polys:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                co = me.vertices[vi].co
                u = (co[(axis + 1) % 3] - minx) / dx
                v = (co[(axis + 2) % 3] - miny) / dy
                uv[li].uv = (cell_x + u * cell_w, cell_y + v * cell_h)


def make_palette_image():
    cols = len(PALETTE)
    cw, h = 16, 64
    img = bpy.data.images.new("palette", cols * cw, h, alpha=False)
    img.colorspace_settings.name = "sRGB"
    px = [0.0] * (cols * cw * h * 4)
    for i, (_name, rgb) in enumerate(PALETTE):
        light = srgb_to_linear(tuple(min(1.0, c * 0.82 + 0.18) for c in rgb))
        dark = srgb_to_linear(tuple(max(0.0, c * 0.72) for c in rgb))
        for y in range(h):
            t = y / (h - 1)
            col = tuple(dark[k] * (1 - t) + light[k] * t for k in range(3))
            for x in range(cw):
                o = ((y * cols * cw) + i * cw + x) * 4
                px[o:o + 3] = col
                px[o + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()
    return img


def flat_image(name, color, space, size=8):
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = space
    px = [color[0], color[1], color[2], 1.0] * (size * size)
    img.pixels.foreach_set(px)
    img.pack()
    return img


def gltf_group():
    ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ng.interface.new_socket("Occlusion", socket_type="NodeSocketFloat")
    ng.nodes.new("NodeGroupOutput")
    ng.nodes.new("NodeGroupInput")
    return ng


def build_material(palette, ao, normal):
    mat = bpy.data.materials.new("Vinyl")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    bsdf.inputs["Roughness"].default_value = 0.28
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    uv_p = nodes.new("ShaderNodeUVMap")
    uv_p.uv_map = "Palette"
    uv_p.location = (-700, 200)
    uv_b = nodes.new("ShaderNodeUVMap")
    uv_b.uv_map = "Bake"
    uv_b.location = (-700, -80)

    tex_c = nodes.new("ShaderNodeTexImage")
    tex_c.image = palette
    tex_c.location = (-420, 200)
    links.new(uv_p.outputs["UV"], tex_c.inputs["Vector"])
    links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])

    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = normal
    tex_n.location = (-420, -40)
    links.new(uv_b.outputs["UV"], tex_n.inputs["Vector"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-120, -40)
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = ao
    tex_a.location = (-420, -480)
    links.new(uv_b.outputs["UV"], tex_a.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-140, -480)
    links.new(tex_a.outputs["Color"], sep.inputs["Color"])
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = gltf_group()
    group.location = (300, -360)
    links.new(sep.outputs["Red"], group.inputs["Occlusion"])
    # keep a handle on the image node we retarget during bake
    mat["bake_node"] = tex_n.name
    return mat, tex_n


def normalize_uvs(obj):
    """Palette is TEXCOORD_0, Bake is TEXCOORD_1. Boolean leftovers add a third map."""
    me = obj.data
    for name in [uv.name for uv in me.uv_layers]:
        if name not in ("Palette", "Bake"):
            me.uv_layers.remove(me.uv_layers[name])
    if "Palette" not in me.uv_layers or "Bake" not in me.uv_layers:
        raise SystemExit("missing uv on " + obj.name)
    if me.uv_layers[0].name == "Palette":
        return
    pal = [uv.uv[:] for uv in me.uv_layers["Palette"].data]
    bake = [uv.uv[:] for uv in me.uv_layers["Bake"].data]
    while len(me.uv_layers):
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="Palette")
    me.uv_layers.new(name="Bake")
    for i, uv in enumerate(pal):
        me.uv_layers["Palette"].data[i].uv = uv
    for i, uv in enumerate(bake):
        me.uv_layers["Bake"].data[i].uv = uv


def assign(obj, mat):
    me = obj.data
    me.materials.clear()
    me.materials.append(mat)
    # Boolean faces keep a stale material_index and export a second slot.
    for poly in me.polygons:
        poly.material_index = 0


def soften_ao(img):
    # Keep creases, drop the plaster. Faces sit near white.
    px = list(img.pixels)
    out = [1.0] * len(px)
    n = len(px) // 4
    for i in range(n):
        v = 0.72 + 0.28 * px[i * 4]
        o = i * 4
        out[o] = out[o + 1] = out[o + 2] = v
    img.pixels.foreach_set(out)
    img.pack()


def _disconnect(nt, node):
    held = []
    for out in node.outputs:
        for link in list(out.links):
            held.append((out, link.to_socket))
            nt.links.remove(link)
    return held


def bake(mat, meshes, ao_img, nrm_img):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    scene.view_settings.view_transform = "Standard"
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True
    try:
        scene.render.bake.margin_type = "EXTEND"
    except Exception:
        pass
    for o in bpy.data.objects:
        o.select_set(False)
    for o in meshes:
        o.select_set(True)
        o.data.uv_layers["Bake"].active = True
    bpy.context.view_layer.objects.active = meshes[0]

    nt = mat.node_tree
    tex_nodes = [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image]
    tex_a = next(n for n in tex_nodes if n.image.name == "ao")
    tex_n = next(n for n in tex_nodes if n.image.name == "normal")
    # Sampling the target image makes Cycles report a cycle and skip the bake.
    held = _disconnect(nt, tex_a) + _disconnect(nt, tex_n)

    def run(node, img, kind, samples, **kw):
        scene.cycles.samples = samples
        node.image = img
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node
        print("bake", kind, samples, flush=True)
        bpy.ops.object.bake(type=kind, margin=4, use_clear=True, **kw)
        img.pack()

    run(tex_a, ao_img, "AO", 32)
    run(tex_n, nrm_img, "NORMAL", 16, normal_space="TANGENT")
    soften_ao(ao_img)
    for out, sock in held:
        nt.links.new(out, sock)
    ao_img.colorspace_settings.name = "Non-Color"
    nrm_img.colorspace_settings.name = "Non-Color"
    for img, name in ((ao_img, "/tmp/rocket_ao.png"), (nrm_img, "/tmp/rocket_normal.png")):
        img.filepath_raw = name
        img.file_format = "PNG"
        img.save()


def export(meshes):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in meshes:
        o.select_set(True)
        pid = o.name if any(p["id"] == o.name for p in PARTS) else None
        if pid:
            part = next(p for p in PARTS if p["id"] == pid)
            o["partId"] = pid
            o["blocks"] = ",".join(part["blocks"])
            fy = yup(part["fall"])
            o["fallX"], o["fallY"], o["fallZ"] = fy
            o["cellEdge"] = part["cell"]
    # empties
    for i, s in enumerate(SCREWS):
        e = bpy.data.objects.new(f"screw_{i:02d}", None)
        bpy.context.collection.objects.link(e)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.03
        e.location = s["pos"]
        e.rotation_mode = "QUATERNION"
        e.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(s["normal"])
        e["part"] = s["part"]
        e["color"] = s["color"]
        e["index"] = i
        ny = yup(s["normal"])
        e["nx"], e["ny"], e["nz"] = ny
        e["diameter"] = s["diameter"]
        e.select_set(True)
        meshes.append(e)
    bpy.context.view_layer.objects.active = meshes[0]
    glb = os.path.join(OUT, "rocket.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_image_format="WEBP",
        export_image_quality=88,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_texcoords=True,
        export_normals=True,
        export_animations=False,
    )
    return glb


def write_json(order, phase):
    cycle = color_cycle(phase)
    by_id = {p["id"]: p for p in PARTS}
    parts = []
    for p in PARTS:
        parts.append({
            "id": p["id"],
            "blocks": p["blocks"],
            "fall": yup(p["fall"]),
            "color": p["color"],
            "cellEdge": p["cell"],
            "layer": p["layer"],
            "sectors": p["sectors"],
            "rings": p["rings"],
            "space": p["space"],
        })
    screws = []
    for s in SCREWS:
        screws.append({
            "part": s["part"],
            "color": s["color"],
            "pos": yup(s["pos"]),
            "normal": yup(s["normal"]),
            "diameter": s["diameter"],
            "coveredBy": list(s.get("coveredBy") or []),
        })
    up0 = [i for i, s in enumerate(SCREWS) if s["part"] == "up0"]
    mid = 0
    for n, ix in enumerate(order, start=1):
        if ix in up0:
            mid = n
    reveal = 0
    for n, ix in enumerate(order):
        if SCREWS[ix].get("coveredBy"):
            reveal = n
            break
    preview = up0[0]
    covers = list(SCREWS[preview].get("coveredBy") or [])
    payload = {
        "generator": "tools/blender/rocket.py",
        "palette": [{"name": n, "hex": "#{:02X}{:02X}{:02X}".format(*(int(c * 255) for c in rgb))} for n, rgb in PALETTE],
        "screwColors": {
            "pink": "#FF5CA8",
            "yellow": "#FFC918",
            "lime": "#8FD21E",
            "cyan": "#19C3D3",
            "orange": "#FF8A14",
            "red": "#FF3B4E",
            "blue": "#3D6BFF",
            "purple": "#A13DFF",
        },
        "opening": opening_and_queue(cycle)[0],
        "queue": opening_and_queue(cycle)[1],
        "parts": parts,
        "screws": screws,
        "solution": order,
        "previewScrew": preview,
        "previewCover": covers,
        "midMove": mid,
        "revealMove": reveal,
    }
    path = os.path.join(OUT, "layout.json")
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return path, payload


def tri_count(objs):
    n = 0
    for o in objs:
        if not getattr(o, "data", None) or not hasattr(o.data, "polygons"):
            continue
        for p in o.data.polygons:
            n += max(1, len(p.vertices) - 2)
    return n


def main():
    build()
    print("parts", len(PARTS), "screws", len(SCREWS))
    assign_colors()
    for p in PARTS:
        print(f"  color {p['id']} {p['color']}")
    snap_screws()
    diameters()
    derive_covers()
    for p in PARTS:
        if p["blocks"]:
            print(f"  {p['id']} blocks {p['blocks']}")
    assert_covers()
    order, phase = build_solution()
    if not order:
        raise SystemExit("unsolvable layout")
    verify(order, phase)
    print("verified", len(order), "moves")

    meshes = []
    for o in ALL_OBJS:
        try:
            if o.name in bpy.data.objects and o.type == "MESH":
                meshes.append(o)
        except ReferenceError:
            continue
    for o in meshes:
        if "Palette" not in o.data.uv_layers:
            o.data.uv_layers.new(name="Palette")
        if "Bake" not in o.data.uv_layers:
            o.data.uv_layers.new(name="Bake")
        write_palette(o)
    pack_bake(meshes)

    statics = [o for o in meshes if o.get("role") == "static"]
    cores = [o for o in meshes if o.get("role") == "core"]
    print("join static", len(statics), "core", len(cores))
    static = fuse("static", statics) if statics else None
    core = fuse("core", cores) if cores else None
    if static:
        static["role"] = "static"
    if core:
        core["role"] = "core"

    final = []
    for p in PARTS:
        final.append(p["obj"])
    if static:
        final.append(static)
    if core:
        final.append(core)
    # fused objects keep uvs; refresh ALL_OBJS consumers
    for o in final:
        if "Palette" not in o.data.uv_layers or "Bake" not in o.data.uv_layers:
            raise SystemExit("missing uv on " + o.name)

    palette = make_palette_image()
    if QUICK:
        ao = flat_image("ao", (1, 1, 1), "Non-Color")
        nrm = flat_image("normal", (0.5, 0.5, 1), "Non-Color")
    else:
        ao = bpy.data.images.new("ao", RES, RES, alpha=False)
        ao.colorspace_settings.name = "Non-Color"
        nrm = bpy.data.images.new("normal", RES, RES, alpha=False)
        nrm.colorspace_settings.name = "Non-Color"
    mat, bake_node = build_material(palette, ao, nrm)
    for o in final:
        normalize_uvs(o)
        assign(o, mat)
        print("uv", o.name, [uv.name for uv in o.data.uv_layers])
    if not QUICK:
        bake(mat, final, ao, nrm)
        # restore node images after bake retarget
        # ao and normal already packed; reconnect by name
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.name == "normal":
                pass
        # The bake leaves the normal image on the shared image node.
        # Reconnect explicit images.
        imgs = {n.image.name: n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
        # rebuild links cleanly
        build_material_links(mat, palette, ao, nrm)

    print("tris", tri_count(final))
    glb = export(final)
    path, payload = write_json(order, phase)
    size = os.path.getsize(glb)
    print("GLB", glb, size)
    print("JSON", path)
    counts = {}
    for s in SCREWS:
        counts[s["color"]] = counts.get(s["color"], 0) + 1
    print("SUMMARY", json.dumps({
        "parts": len(PARTS),
        "screws": len(SCREWS),
        "counts": counts,
        "tris": tri_count(final),
        "glb": size,
        "mid": payload["midMove"],
        "reveal": payload["revealMove"],
        "preview": payload["previewScrew"],
        "cover": payload["previewCover"],
        "quick": QUICK,
    }))
    if size > 6_000_000:
        print("WARN glb over 6MB")


def build_material_links(mat, palette, ao, nrm):
    # Called after bake so each texture node points at the right image.
    nt = mat.node_tree
    tex_nodes = [n for n in nt.nodes if n.type == "TEX_IMAGE"]
    # Identify by current location-ish: we stored names at creation, but bake
    # overwrote the normal node's image. Reassign by walking known links.
    # Simpler: set images by the UV map they use.
    for n in tex_nodes:
        if not n.inputs["Vector"].links:
            continue
        src = n.inputs["Vector"].links[0].from_node
        if getattr(src, "uv_map", "") == "Palette":
            n.image = palette
        elif getattr(src, "uv_map", "") == "Bake":
            # two bake textures share this uv; distinguish by what they feed
            if n.outputs["Color"].links:
                dst = n.outputs["Color"].links[0].to_node
                if dst.type == "NORMAL_MAP" or (dst.type == "SEPARATE_COLOR"):
                    pass
                if dst.type == "NORMAL_MAP":
                    n.image = nrm
                elif dst.type == "SEPARATE_COLOR":
                    n.image = ao
                else:
                    n.image = nrm
    for img, space in ((palette, "sRGB"), (ao, "Non-Color"), (nrm, "Non-Color")):
        img.colorspace_settings.name = space
        if not img.packed_file:
            img.pack()


if __name__ == "__main__":
    main()
