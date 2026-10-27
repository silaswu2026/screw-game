# Publish note

Visual upgrade v5: characters are single organic shells (SDF marching cubes, lathe, extrude) instead of stacked rounded boxes. Plush/candy MeshPhysicalMaterial, ink silhouette, painted sky, lathe stage, contact shadow. Screws and anchors unchanged.

## GitHub Pages
https://silaswu2026.github.io/screw-game/

## How models were made
- **Characters (runtime):** `js/characters.js`
  - Cat, bear, robot, car body: smooth-union SDF (ellipsoid / capsule) meshed with marching cubes (`js/sculpt.js`). Vertex colors for belly, muzzle, inner ear, limbs. Eye sockets are subtracted; eyes, lids, blush, nose, and smile are separate meshes.
  - Cake: displaced cylinder tiers (lip, drips, dome) plus cherry, pearls, sprinkles.
  - Popsicle: one beveled extrude with stripe vertex colors and a wood capsule stick.
  - Rocket and UFO: lathe profiles, glass accents, fins / rim lights.
- **Tables:** `js/mcTables.js` is the public-domain Bourke/Bloyd marching-cubes table set, copied from three.js r160 (MIT). No downloaded character meshes. Blender was not available; nothing was scraped from Screwdom.
- **Legacy GLBs** in `assets/` are from an earlier pass and are not loaded.
- **Screws:** unchanged (`js/screwMesh.js`).
- **Scene:** 512² painted sky (sun, clouds or nebula/stars), soft floor disc, lathe pedestal, radial contact shadow, theme key/fill/rim/bounce. Fog stays light so the characters stay readable on a phone.

## Limitations
- SDF shells are smooth clay/vinyl, not film-resolution sculpted fur. Ears and limbs blend into the body on purpose.
- No texture maps or subsurface scattering. Plush is sheen + clearcoat.
- Transmission (windshield, dome, visor, porthole) costs an extra render pass; only one character is on screen.
- Screw plates still cover the torso. Faces are placed above that band so they stay visible.
