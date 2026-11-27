#!/usr/bin/env node
// scripts/generate-og.mjs — SOLE OWNERSHIP: scripts/generate-og.mjs
// Generates public/og-image.jpg 1200x630, <300KB, using Python PIL + ffmpeg if available, fallback to canvas-less SVG
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const W = 1200, H = 630;

// Try Python PIL path first
try {
  execSync(`python3 -c "
from PIL import Image, ImageDraw, ImageFont
import subprocess, pathlib
W, H = 1200, 630
im = Image.new('RGB', (W, H), '#07090F')
d = ImageDraw.Draw(im)
# subtle gold vignette
for i in range(0, H, 2):
    alpha = int(8 + 6 * (i / H))
    d.line([(0, i), (W, i)], fill=(201,166,107,alpha))
# Mark — geometric gold W (two overlapping peaks)
d.polygon([(360, 260), (460, 160), (600, 300), (740, 160), (840, 260), (780, 260), (740, 190), (600, 360), (460, 190), (420, 260)], fill=(201,166,107))
# Light highlight
d.polygon([(460,190),(600,360),(560,360),(460,190)], fill=(232,220,200))
# Text
try:
    font_b = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 64)
    font_s = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
except:
    font_b = ImageFont.load_default()
    font_s = ImageFont.load_default()
d.text((360, 390), 'INVEMON', fill=(244,240,230), font=font_b)
d.text((360, 470), 'Private wealth, quietly compounded  —  invemon.com', fill=(154,163,184), font=font_s)
im.save('/tmp/invemon-og.png', 'PNG')
print('PIL ok')
"`, { stdio: 'inherit' });
  // Convert to jpg <300KB via ffmpeg
  execSync(`ffmpeg -y -i /tmp/invemon-og.png -vf "scale=1200:630" -q:v 6 public/og-image.jpg 2>&1 | head -20`, { stdio: 'inherit' });
  console.log('OG image generated via PIL + ffmpeg');
} catch (e) {
  // Fallback: minimal SVG rasterized via sharp-like placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#07090F"/><path d="M360 260 L460 160 L600 300 L740 160 L840 260 L780 260 L740 190 L600 360 L460 190 L420 260 Z" fill="#C9A66B"/><text x="360" y="420" font-family="Inter, sans-serif" font-size="64" fill="#F4F0E6">INVEMON</text><text x="360" y="470" font-family="Inter, sans-serif" font-size="22" fill="#9AA3B8">Private wealth, quietly compounded — invemon.com</text></svg>`;
  writeFileSync('public/og-image.svg', svg);
  console.log('Fallback OG SVG written (install python3-pil + ffmpeg for JPG)');
}
