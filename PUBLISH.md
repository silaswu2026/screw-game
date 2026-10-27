# Publish note

Characters are clean chibi forms with a tighter finish: lathe bodies, painted irises (gradient, pupil, catchlights), soft blush, and a light studio grade (warm crown, cooler shade). The cat has a rose collar and a small gold bell. Cake drips are piped teardrops with a pearl row. Thick sticker outlines are gone. The earlier marching-cubes shells read as melted lumps and are no longer used.

## Rocket demo
A separate quality sample, not a replacement for the main game: https://silaswu2026.github.io/screw-game/rocket-demo/

30 removable parts in ten candy hues (red, orange, yellow, lime, green, teal, sky, royal blue, purple, pink). 63 screws in eight colors: pink, yellow, lime, cyan, and orange nine each; red, blue, and purple six each. Four boxes on screen; the queue brings the other colors as boxes clear. `rocket-demo/assets/rocket.glb` is 310 KB (was 1.58 MB).

## How the rocket was made
Original geometry only, from `tools/blender/rocket.py` in Blender 4.2 LTS. No downloaded meshes.

- Parts sit on an 8-sector grid so neighboring shells get different hues and do not interpenetrate. Which screw is blocked is measured, not hand-listed: a ray out from the cap has to hit another part. The nose skirt covers the collar, the orange waist band covers one screw on each body panel, the left porthole tab covers one window-frame screw, the front lower shell covers the nozzle, and each side fin covers that booster's mount tab.
- One vinyl material. A shared palette holds saturated color cells with a short light-to-dark gradient, written in linear color so the glTF export stays punchy. Adjacent parts use different hues. Cycles bakes a soft ambient occlusion and a clean tangent normal (seams and rivets, no plaster grain) at 512. Both maps ship as WebP inside the GLB (AO about 16 KB, normal about 3 KB). There is no KTX2: the vendored loader has no Basis transcoder. Lathe segments and bevel subdivisions were cut where the phone-sized silhouette does not show them. Geometry is quantized and packed with EXT_meshopt_compression (meshoptimizer 0.21). The matching decoder is `vendor/addons/libs/meshopt_decoder.module.js`. Part meshes stay separate so they can still fall. Source triangles went from 39,490 to 16,178.
- Screws are one three.js template, placed from the layout table with InstancedMesh. Each one is raycast onto a boss so the cap sits flush and the threaded shank embeds into the part. One to four screws per part, spread on the joint rather than stacked. The cap is about 30% of that part's edge, a low dome, with a cross slot 40% of the cap height. A screw's color contrasts with its part. The pad, green grass, flowers, rocks, and the small astronaut are one merged mesh.
- The solution is generated with the layout and replayed by the page. A part falls only when every one of its screws is out. Eighteen screws start hidden; a blocked tap immediately ghosts the covering part so the hidden screw shows through. One screw left and the part wobbles. Four 3-hole boxes, five holding slots, then launch.
- Feel: a tap paints on pointerdown (press shrinks the screw, or the cover ghosts) before the pointer is released. A drag past 14px, or a hold longer than 420ms, orbits instead of unscrewing. The orbit coasts with inertia and the pitch stays inside a small range, then eases back to the hero angle. Unscrewing spins and rises for 0.25s, arcs into the box or slot, and squashes on landing. A freed part drops with gravity and a tumble. Short WebAudio ticks cover the unscrew, the landing, the drop, a cleared box, and a blocked tap. Android gets a short `navigator.vibrate`. Screws are picked in screen space, with a hit radius of at least 36px, and a nearer screw wins. The opaque and ghost shaders are compiled during boot. Stars are one instanced billboard. Phone pixels are capped at 1.5 (1.75 on a wide window). On a 390×844 headless frame the last render was 38 draw calls and 50,564 triangles, shadow pass included. Fetching the GLB on localhost took about 2ms; that is not a phone network time. The 310 KB file is the load that matters.

## Limitations
- Denser than the old 11-part rocket, still not castle-brick density. The astronaut is a simple original figure, not a sculpted character.
- Headless Chrome throttles animation frames (the on-screen counter sat near 6). That is not a phone frame rate. A real phone GPU was not measured. The tap paint itself returned in under 5ms in that same headless session.
- Side-by-side against the previous 1.58 MB rocket, the start frame kept the same sharpness and the same covers. Toaster and castle reference boards were not in this workspace.

## How models were made
- Cat and bear: one lathe silhouette, sculpted ears with a contrasting inner ear, cream muzzle and belly, short limbs. Cat wears a collar and bell.
- Robot: capsule body, sphere head, collar, glass visor with a metal bezel, capsule limbs.
- Car: two rounded volumes, a light belt line, inset glass, disc lamps, separate wheels.
- Cake, popsicle, rocket, UFO: lathe or beveled extrude.
- All original geometry in `js/characters.js`. No downloaded meshes. Screws and anchors unchanged.

## Limitations
- Still procedural, not a sculpted film mesh. Ears meet the head at a clean intersection.
- Plush is sheen, not a fur texture.
- Screw plates still cover the torso. Faces sit above that band.
