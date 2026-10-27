# 3D assets (shipped in-repo, no CDN)

| File | Role |
|------|------|
| `screw.glb` | High-detail screw (helical thread, washer rim, Phillips recess). Runtime builds matching mesh in `js/screwMesh.js` so head color can vary per screw. |
| `panel.glb` | Reference beveled board. Runtime uses ExtrudeGeometry plates with bevel. |
| `cat.glb` … `ufo.glb` | Legacy reference meshes from an earlier pass. **Not used at runtime.** |

Runtime characters are original procedural meshes in `js/characters.js` (SDF marching cubes, lathe, extrude). Anchors stay in `js/models.js`. No third-party stock models. Marching-cubes tables in `js/mcTables.js` are the public-domain Bourke/Bloyd tables as shipped with three.js r160 (MIT).
