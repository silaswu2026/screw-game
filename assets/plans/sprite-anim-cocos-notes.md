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
