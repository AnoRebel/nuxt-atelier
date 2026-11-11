// The media guide's focal-point image and video, made by the code the site uses: a drawn scene, cropped
// by `cropBox` around a focal point with sharp. Run from the repo root after changing the crop code:
//   bun docs/scripts/media-images.ts   (needs ffmpeg with libx264 for the video)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { cropBox } from '../../packages/core/src/runtime/server/media/images'

const OUT = new URL('../public/media/', import.meta.url).pathname
const [W, H] = [1600, 1000]
const FOCAL = { x: 0.74, y: 0.6 }

// A landscape with its subject, a house, off to the right: centred crops would cut it out
const scene = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4f0"/><stop offset="1" stop-color="#e6f4fb"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="260" cy="200" r="90" fill="#ffd45c"/>
  <path d="M0 640 Q 400 470 820 620 T 1600 560 V1000 H0Z" fill="#8fc77a"/>
  <path d="M0 760 Q 500 640 1000 760 T 1600 720 V1000 H0Z" fill="#5fa65a"/>
  <g transform="translate(1100 470)">
    <rect x="0" y="80" width="200" height="150" fill="#f4ead8"/>
    <path d="M-20 90 L100 0 L220 90Z" fill="#c8553d"/>
    <rect x="80" y="160" width="40" height="70" fill="#6b4a3a"/>
    <rect x="25" y="115" width="38" height="34" fill="#9fd3f0"/><rect x="137" y="115" width="38" height="34" fill="#9fd3f0"/>
  </g>
  <g fill="#3d7a44"><circle cx="420" cy="660" r="55"/><circle cx="500" cy="690" r="42"/><rect x="415" y="700" width="10" height="50" fill="#6b4a3a"/></g>
</svg>`)).png().toBuffer()

const crop = (ratio: number) => sharp(scene).extract(cropBox(W, H, ratio, FOCAL))

// The original, with its focal point marked
const marker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <circle cx="${FOCAL.x * W}" cy="${FOCAL.y * H}" r="34" fill="none" stroke="#fff" stroke-width="8"/>
  <circle cx="${FOCAL.x * W}" cy="${FOCAL.y * H}" r="34" fill="none" stroke="#111" stroke-width="3"/>
  <circle cx="${FOCAL.x * W}" cy="${FOCAL.y * H}" r="7" fill="#fff" stroke="#111" stroke-width="3"/>
</svg>`)
await sharp(await sharp(scene).composite([{ input: marker }]).png().toBuffer()).resize({ width: 1200 }).webp({ quality: 80 }).toFile(`${OUT}focal-original.webp`)

// The video: the frame changes shape from 21:9 to 9:16 and back; left, where the crop falls on the
// original, right, the crop itself
const [FW, FH, PANE] = [1280, 720, 600]
const FRAMES = 240
const frames = mkdtempSync(join(tmpdir(), 'atelier-focal-'))
const small = await sharp(scene).resize({ width: PANE }).png().toBuffer()
const scale = PANE / W
for (let i = 0; i < FRAMES; i++) {
  const t = (1 - Math.cos((i / FRAMES) * 2 * Math.PI)) / 2 // 0 → 1 → 0, eased
  const ratio = Math.exp(Math.log(21 / 9) + t * (Math.log(9 / 16) - Math.log(21 / 9)))
  const box = cropBox(W, H, ratio, FOCAL)
  const fit = Math.min(PANE / box.width, (FH - 120) / box.height)
  const [cw, ch] = [Math.round(box.width * fit), Math.round(box.height * fit)]
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PANE}" height="${H * scale}">
    <path fill-rule="evenodd" fill="#000" fill-opacity=".55" d="M0 0H${PANE}V${H * scale}H0Z M${box.left * scale} ${box.top * scale}h${box.width * scale}v${box.height * scale}h-${box.width * scale}Z"/>
    <rect x="${box.left * scale}" y="${box.top * scale}" width="${box.width * scale}" height="${box.height * scale}" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="${FOCAL.x * PANE}" cy="${FOCAL.y * H * scale}" r="12" fill="none" stroke="#fff" stroke-width="4"/>
  </svg>`)
  const cropped = await crop(ratio).resize({ width: cw, height: ch }).png().toBuffer()
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="60">
    <text x="${FW / 2}" y="40" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="28" fill="#e5e7eb">aspect ratio ${ratio >= 1 ? `${ratio.toFixed(2)} : 1` : `1 : ${(1 / ratio).toFixed(2)}`}</text>
  </svg>`)
  await sharp({ create: { width: FW, height: FH, channels: 3, background: '#111827' } })
    .composite([
      { input: small, left: 30, top: Math.round((FH - H * scale) / 2) },
      { input: overlay, left: 30, top: Math.round((FH - H * scale) / 2) },
      { input: cropped, left: 30 + PANE + 20 + Math.round((PANE - cw) / 2), top: Math.round((FH - ch) / 2) },
      { input: label, left: 0, top: 30 },
    ])
    .png()
    .toFile(join(frames, `${String(i).padStart(4, '0')}.png`))
}
const ffmpeg = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', join(frames, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', `${OUT}focal-crop.mp4`])
if (ffmpeg.exitCode)
  throw new Error(ffmpeg.stderr.toString())
await sharp(join(frames, '0000.png')).webp({ quality: 80 }).toFile(`${OUT}focal-crop-poster.webp`)
rmSync(frames, { recursive: true })
console.log(`Wrote the focal-point images and video to ${OUT}`)
