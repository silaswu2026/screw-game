# Publish note

Characters are clean chibi forms with a tighter finish: lathe bodies, painted irises (gradient, pupil, catchlights), soft blush, and a light studio grade (warm crown, cooler shade). The cat has a rose collar and a small gold bell. Cake drips are piped teardrops with a pearl row. Thick sticker outlines are gone. The earlier marching-cubes shells read as melted lumps and are no longer used.

## Rocket demo
A separate quality sample, not a replacement for the main game: https://silaswu2026.github.io/screw-game/rocket-demo/

30 removable parts, 72 candy screws (18 pink, 18 yellow, 18 lime, 18 cyan). The download is `rocket-demo/assets/rocket.glb` (1.7 MB) plus `layout.json`. Nothing here replaces the main game.

## How the rocket was made
Original geometry only, from `tools/blender/rocket.py` in Blender 4.2 LTS. No downloaded meshes.

- Parts sit on an 8-sector grid. Removal order comes from layer, sector, and ring, so shells do not interpenetrate and do not need a hand-written overlap list.
- One vinyl material. A shared palette texture holds eleven color cells, each a vertical light-to-dark gradient. A part picks its cell with the first UV. That is the color and a fake top light. Adjacent parts use different cells. Cycles bakes ambient occlusion and a tangent normal (seams, rivets, grass, a light plastic grain) into the second UV. Both maps ship as WebP inside the GLB. There is no KTX2: the vendored loader has no Basis transcoder.
- Screws are one three.js template, placed from the layout table (part, position, normal, color) with InstancedMesh. The cap is about 30% of that part's edge, a low dome, with a cross slot 40% of the cap height and a shank that shows two thread rings. A screw's color is never its part's color. The static pad, grass, flowers, rocks, and the small astronaut are one merged mesh. Removable parts stay separate so they can fall.
- The solution is generated with the layout and replayed by the page. Four 3-hole boxes, five holding slots, hold-to-preview, then launch.

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
