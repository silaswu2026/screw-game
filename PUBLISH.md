# Publish note

Visual upgrade v4: organic character silhouettes, candy MeshPhysicalMaterial, themed sky/clouds/stars, stage pedestal, soft contact shadow, ambient particles. Screws kept from prior polish.

## Paths
- Source: `/workspace/screw3d-v2/`
- Zip: `/workspace/screw3d-v2.zip`
- Publish-ready: `/workspace/pub/screw3d/` → `silaswu2026/screw-game`
- Assets: `/workspace/screw3d-v2/assets/*.glb` (code-authored; Blender not available)

## GitHub Pages
https://silaswu2026.github.io/screw-game/

## How models were made
- **Screws:** unchanged this pass — LatheGeometry head + TubeGeometry helical thread (`js/screwMesh.js`); matching `assets/screw.glb`.
- **Characters:** original procedural polish in `models.js` (higher RoundedBox bevel, cheek/limb spheres, capsules, emissive eye/light accents). Matching softer GLBs via `tools/gen_glb_assets.py` (rounded_box + denser spheres). No CC0 downloads — Blender unavailable.
- **Scene:** canvas-gradient sky dome (fog-free), soft clouds or stars per theme, radial soft shadow, rounded pedestal + rim, floating Points particles. RoomEnvironment PMREM + soft key/fill/rim retained/tuned.

## Limitations
- Still assembled primitives (no true organic remesh / subdivision surface / sculpt). Joint seams remain visible vs a Disney film hero mesh.
- No subsurface scattering texture maps; SSS approximated via sheen + emissive accents.
- Screws deliberately left as previous high-detail meshes.

## Save key
`lscc3d`
