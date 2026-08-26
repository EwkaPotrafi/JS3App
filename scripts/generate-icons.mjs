/* Rasterises the icon sources into the PNGs the manifest and index.html ask for.
   The SVGs are the originals — edit those, then re-run this.

     npm i sharp && node scripts/generate-icons.mjs

   180 is Safari's apple-touch-icon, 192 and 512 are the manifest's "any"
   icons, and maskable-512 is the one Android crops to its own mask shape. */
import sharp from 'sharp'
import { readFileSync } from 'fs'

const jobs = [
  ['icon.svg', 180, 'icon-180.png'],
  ['icon.svg', 192, 'icon-192.png'],
  ['icon.svg', 512, 'icon-512.png'],
  ['icon-maskable.svg', 512, 'icon-maskable-512.png'],
]

for (const [src, size, out] of jobs) {
  await sharp(readFileSync(new URL(`../${src}`, import.meta.url)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(new URL(`../${out}`, import.meta.url).pathname)
  console.log(`✓ ${out}  ${size}×${size}  from ${src}`)
}
