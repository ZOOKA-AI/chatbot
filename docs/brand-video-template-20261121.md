# Brand video template (approved identity v2)

Source of truth: `design/brand-v2/tokens/tokens.ts` and `design/brand-v2/README.md`.
Palette used, unchanged: blue `#2E86AB`, purple `#A23B72`, ice `#F8F9FA`, navy `#0B1220`, cyan `#10D4FF`.
Logos used, unchanged: `public/brand/logo-horizontal-ar-640.png`, `public/brand/zooka-mark-256.png`.
Arabic slogan: `تقنية بإيمان، تقدّم بأخلاق`. English tagline: `Innovate • Automate • Grow`.

## Asset

`public/videos/brand/zk-intro-1080x1920.mp4`

ffprobe verified: h264, 1080x1920, yuv420p, 30 fps, 150 frames, 5.000 s, ~145 KB.

## Rebuild

```bash
# Cairo (OFL) from google/fonts is NOT vendored; point the script at it:
BRAND_FONT_AR=/path/to/Cairo.ttf python3 scripts/brand/render_intro.py
ffmpeg -framerate 30 -i build/frames/f%04d.png \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium -movflags +faststart \
  public/videos/brand/zk-intro-1080x1920.mp4
```

No invented imagery: the only pictures are the approved logo lockups; everything else is
palette, typography and motion.

## Not done here

- No Arabic text is drawn by ffmpeg; it is drawn by PIL with `arabic_reshaper` + `bidi` so
  the letters join correctly, then encoded by ffmpeg.
- No change to `main`, no Production deploy, no app code touched.
