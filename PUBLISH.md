# Publish note

Characters are clean chibi forms: a smooth lathe body, separate ears, and a drawn face (sclera, iris, pupil, catchlights). The earlier marching-cubes shells read as melted lumps and are no longer used.

## GitHub Pages
https://silaswu2026.github.io/screw-game/

## How models were made
- Cat and bear: one lathe silhouette (head and body in a single smooth profile), cone or sphere ears, cream muzzle and belly, short limbs.
- Robot: capsule body, sphere head, collar, glass visor, capsule limbs.
- Car: two rounded volumes, inset glass, disc lamps, separate wheels.
- Cake, popsicle, rocket, UFO: lathe or beveled extrude.
- All original geometry in `js/characters.js`. No downloaded meshes. Screws and anchors unchanged.

## Limitations
- Still procedural, not a sculpted film mesh. Ears meet the head at a clean intersection.
- Plush is sheen, not a fur texture.
- Screw plates still cover the torso. Faces sit above that band.
