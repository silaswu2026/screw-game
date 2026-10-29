# Sprite-frame animation notes (Cocos2d-html5 → xy-go)

Date: 2026-10-28 (Asia/Shanghai)  
Goal: replace procedural canvas knockdown poses with **sequenced 2D images** (sprite frames / spritesheet), matching how Cocos2d-html5 plays character animation.

## Cocos2d-html5 pattern (study summary)

1. **Sprite sheet + atlas**  
   Pack many small poses into one texture (`*.png`). An atlas (plist historically; we use tiny JSON) maps frame name → `{x,y,w,h}` rect inside that texture.  
   Cocos loads this once into **`cc.spriteFrameCache`** (`addSpriteFrames`), then `getSpriteFrame("name")` returns a **SpriteFrame** (texture + rect).

2. **Animation data**  
   `cc.Animation` holds an ordered list of SpriteFrames plus **delay per frame** (e.g. `0.1` s ≈ 10 fps). Optional loop count (`-1` = forever).

3. **Playback action**  
   `cc.Animate` (action) swaps the sprite’s display frame on a timer. Typical flow:
   ```js
   // conceptual Cocos2d-html5
   cc.spriteFrameCache.addSpriteFrames("green.plist");
   var frames = ["knock_0","knock_1","crawl_0","crawl_1","getup"]
     .map(n => cc.spriteFrameCache.getSpriteFrame(n + ".png"));
   var anim = new cc.Animation(frames, 0.1);
   sprite.runAction(cc.animate(anim));
   ```

4. **Why not procedural lean?**  
   Rotating one portrait JPG looks “wrong” (Father 伍欣): limbs don’t change, scarf doesn’t settle, prone/crawl read as the same drawing. Flipbook frames fix silhouette per beat.

## xy-go playback (this repo)

| Piece | Path / role |
|-------|-------------|
| Individual frames | `xy-go/sprites/green/{idle,knock_0,knock_1,crawl_0,crawl_1,getup,hurt_skeleton}.png` |
| Sheet | `xy-go/sprites/green/green-knock-sheet.png` (7×256 horizontal) |
| Atlas | `xy-go/sprites/green/green-knock-atlas.json` → `{frames:{name:{x,y,w,h}}, meta}` |
| Mirror copy | `assets/sprites/green/` (same files) |

**Frame player in `game.js` (Cocos mirror):**

- Load sheet + atlas (or discrete PNGs as fallback) into an in-memory frame cache.  
- On bomb hit (`hurtBomb` → knock phases): play one-shot sequence  
  `knock_0 → knock_1 → crawl_0 → crawl_1 → crawl_0 → getup`  
  at **~10 fps** (delay ≈ 0.1 s), then return to run/idle portrait / idle frame.  
- Draw with `drawImage(sheet, sx,sy,sw,sh, dx,dy,dw,dh)` — same as using a SpriteFrame rect.  
- Optional `hurt_skeleton` overlay while `n.bones > 0` (shared hurt look).  
- Green is authored; blue/red **reuse the green knockdown frames** (same sequence) when tint is hard — green must look correct first.

**Timing vs old knock phases:**

| Phase | Approx duration | Frames shown |
|-------|-----------------|--------------|
| air | ~0.28 s | `knock_0` |
| prone | until crawl | `knock_1` |
| crawl | until rise | `crawl_0` / `crawl_1` alternating |
| rise | until idle | `getup` |

HP still −1; bomb pad demo unchanged.

## Test

Open https://silaswu2026.github.io/shuyang-chengzhangwu/xy-go/ → 玩家A → walk onto bomb pad (~column 7). Expect image-frame knockdown → crawl → getup, not a vector lean of the portrait.


## Locomotion (idle / walk / jump) — 2026-10-29

Same Cocos SpriteFrameCache path as knockdown. Extra frames on the sheet:

| Frames | Names |
|--------|-------|
| Walk cycle (~10 fps loop) | `walk_0` … `walk_3` |
| Jump / air | `jump_0` |
| Idle | `idle` (already on sheet) |

`drawNinja` picks `locoFrameName(n)` from `n.anim` (`run` → walk flipbook, `jump`/`slide`/`walljump` → `jump_0`, else `idle`) instead of the static portrait JPG. Blue/red reuse green loco frames (same as knockdown).

**Test:** Open xy-go → 玩家A → hold left/right. Feet/scarf must change pose every ~0.1s (not a sliding portrait). Jump shows tucked `jump_0`.


## Scenes / backgrounds (原画) — 2026-10-29

Flat gradient + triangle trees replaced by parallax **scene plates** under `xy-go/scenes/`:

| Key | File | Levels |
|-----|------|--------|
| forest-day | `forest-day.jpg` | L1 / default |
| moss-dusk | `moss-dusk.jpg` | L2 |
| canopy-night | `canopy-night.jpg` | L3 (+ cycle) |

Also: `yuanhua-forest-panel.jpg` cropped from `assets/plans/xiaoyu-trio-plan-sketch.jpg`; dirt/grass tiles from 原画-style ground for platform tops. `drawSky()` covers the view with the plate and scrolls at 0.12× cam.
