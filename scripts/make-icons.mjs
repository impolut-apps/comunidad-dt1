// Generates placeholder PNG app icons (no dependencies). Replace with final brand artwork later.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BLUE = [0x12, 0x68, 0xd5], WHITE = [255, 255, 255], MINT = [0x8a, 0xdc, 0xc3]

function crc32(buf) {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const S = 3 // supersampling for antialiasing
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const p = pixel((x + (sx + 0.5) / S) / size * 64, (y + (sy + 0.5) / S) / size * 64)
        for (let i = 0; i < 4; i++) acc[i] += p[i]
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      for (let i = 0; i < 4; i++) raw[o + i] = Math.round(acc[i] / (S * S))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const inArc = (x, y, cx, cy, r, w) => y <= cy + 0.5 && Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2
const inRounded = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
// scale: shrink artwork towards centre (for maskable safe zone)
const art = (scale, rounded) => (x, y) => {
  if (rounded && !inRounded(x, y, 16)) return [0, 0, 0, 0]
  const u = 32 + (x - 32) / scale, v = 32 + (y - 32) / scale
  if (inCircle(u, v, 24, 26, 8)) return [...WHITE, 255]
  if (inCircle(u, v, 41, 26, 8)) return [...MINT, 255]
  if (inArc(u, v, 24, 48, 12, 5) || inArc(u, v, 41, 48, 12, 5)) return [...WHITE, 255]
  return [...BLUE, 255]
}
writeFileSync('public/icons/icon-192.png', png(192, art(1, true)))
writeFileSync('public/icons/icon-512.png', png(512, art(1, true)))
writeFileSync('public/icons/icon-maskable-512.png', png(512, art(0.75, false)))
writeFileSync('public/icons/apple-touch-icon.png', png(180, art(1, false)))
console.log('icons written')
