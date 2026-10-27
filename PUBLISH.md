# Publish note

Characters are clean chibi forms with a tighter finish: lathe bodies, painted irises (gradient, pupil, catchlights), soft blush, and a light studio grade (warm crown, cooler shade). The cat has a rose collar and a small gold bell. Cake drips are piped teardrops with a pearl row. Thick sticker outlines are gone. The earlier marching-cubes shells read as melted lumps and are no longer used.

## Rocket demo
A separate quality sample, not a replacement for the main game: https://silaswu2026.github.io/screw-game/rocket-demo/

30 removable parts in ten candy hues (red, orange, yellow, lime, green, teal, sky, royal blue, purple, pink). 63 screws in eight colors: pink, yellow, lime, cyan, and orange nine each; red, blue, and purple six each. Four boxes on screen; the queue brings the other colors as boxes clear. `rocket-demo/assets/rocket.glb` is 1.5 MB.

## How the rocket was made
Original geometry only, from `tools/blender/rocket.py` in Blender 4.2 LTS. No downloaded meshes.

- Parts sit on an 8-sector grid so neighboring shells get different hues and do not interpenetrate. Which screw is blocked is measured, not hand-listed: a ray out from the cap has to hit another part. The nose skirt covers the collar, the orange waist band covers one screw on each body panel, the left porthole tab covers one window-frame screw, the front lower shell covers the nozzle, and each side fin covers that booster's mount tab.
- One vinyl material. A shared palette holds saturated color cells with a short light-to-dark gradient, written in linear color so the glTF export stays punchy. Adjacent parts use different hues. Cycles bakes a soft ambient occlusion and a clean tangent normal (seams and rivets, no plaster grain). Both maps ship as WebP. There is no KTX2: the vendored loader has no Basis transcoder.
- Screws are one three.js template, placed from the layout table with InstancedMesh. Each one is raycast onto a boss so the cap sits flush and the threaded shank embeds into the part. One to four screws per part, spread on the joint rather than stacked. The cap is about 30% of that part's edge, a low dome, with a cross slot 40% of the cap height. A screw's color contrasts with its part. The pad, green grass, flowers, rocks, and the small astronaut are one merged mesh.
- The solution is generated with the layout and replayed by the page. A part falls only when every one of its screws is out. Eighteen screws start hidden; hold-to-preview turns the covering part transparent so those screws show through. One screw left and the part wobbles. A blocked tap ghosts the cover. Four 3-hole boxes, five holding slots, then launch.

## Limitations
- Denser than the old 11-part rocket, still not castle-brick density. The astronaut is a simple original figure, not a sculpted character.
- Headless Chrome throttles animation frames (the on-screen counter sat near 4). A flushed redraw of this scene in the same SwiftShader process was not the limiter. A real phone GPU was not measured.
- Toaster and castle reference boards were not in this workspace. The comparison image is against the previous procedural rocket.

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
