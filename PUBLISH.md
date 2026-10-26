# Publish note

Visual upgrade: high-detail screws (helical thread + Phillips + washer), MeshPhysicalMaterial candy/chrome, RoomEnvironment PMREM, beveled plates, shipped GLB assets.

## Paths
- Source: `/workspace/screw3d-v2/`
- Zip: `/workspace/screw3d-v2.zip`
- Publish-ready: `/workspace/pub/screw3d/` → `silaswu2026/screw-game`
- Assets: `/workspace/screw3d-v2/assets/*.glb` (code-authored; Blender not available)

## GitHub Pages
https://silaswu2026.github.io/screw-game/

## How models were made
- **Screws:** code-authored LatheGeometry head + TubeGeometry helical thread + Phillips recess (`js/screwMesh.js`); matching `assets/screw.glb` via `tools/gen_glb_assets.py`.
- **Characters:** refined procedural RoundedBox/Sphere/etc. cores (higher segments, physical materials); GLB cores also shipped for offline pipeline.
- **Blender:** not installed / no apt package on build box.

## Save key
`lscc3d`
