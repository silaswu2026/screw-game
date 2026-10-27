# 3D assets (shipped in-repo, no CDN)

| File | Role |
|------|------|
| `screw.glb` | High-detail screw (helical thread, washer rim, Phillips recess). Runtime builds matching mesh in `js/screwMesh.js` so head color can vary per screw. |
| `panel.glb` | Reference beveled board. Runtime uses ExtrudeGeometry plates with bevel. |
| `cat.glb` … `ufo.glb` | Legacy reference meshes from an earlier pass. **Not used at runtime.** |

Runtime characters are original procedural meshes in `js/characters.js` (lathe, capsule, rounded box, extrude). Anchors stay in `js/models.js`. No third-party stock models.
