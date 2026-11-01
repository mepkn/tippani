// Draws the tippani card mark in the pastel-blue palette.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

// Usage: npm run icons  (writes into assets/images)
const OUT = process.argv[2] ?? "assets/images";
const NAVY = "#15264A";        // --primary-foreground (light)
const PASTEL = "#8CC2F2";      // --primary
const PASTEL_HI = "#B9DBFA";
const PASTEL_LO = "#78AEEA";
const DARK_BG = "#09090B";     // --background (dark)
const LIGHT_BG = "#EEF5FD";

// A rounded note card with a Markdown heading mark ("#") and a tag on its corner.
const card = "M368 232 H656 A72 72 0 0 1 728 304 V720 A72 72 0 0 1 656 792 H368 A72 72 0 0 1 296 720 V304 A72 72 0 0 1 368 232 Z";
const hash = "M462 360 L432 600 M574 360 L544 600 M392 432 L626 432 M380 528 L614 528";
// Tag: a pointed label with a hole, overlapping the bottom-right corner.
const tag = "M600 640 H740 L800 700 L740 760 H600 A20 20 0 0 1 580 740 V660 A20 20 0 0 1 600 640 Z";
const hole = "M736 700 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0";

type MarkOptions = {
  cardFill: string;
  inkStroke: string;
  tagFill: string;
  scale?: number;
};

function mark({ cardFill, inkStroke, tagFill, scale = 1 }: MarkOptions): string {
  const t = `translate(512 512) scale(${scale}) translate(-512 -512)`;
  return `<g transform="${t}">
    <path d="${card}" fill="${cardFill}"/>
    <path d="${hash}" stroke="${inkStroke}" stroke-width="44" stroke-linecap="round"/>
    <path d="${tag}" fill="${tagFill}" stroke="${cardFill}" stroke-width="20" stroke-linejoin="round"/>
    <path d="${hole}" fill="${cardFill}"/>
  </g>`;
}

const gradient = `<defs><radialGradient id="g" cx="0.25" cy="0.12" r="1.1">
  <stop offset="0" stop-color="${PASTEL_HI}"/><stop offset="0.55" stop-color="${PASTEL}"/><stop offset="1" stop-color="${PASTEL_LO}"/>
</radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>`;

// Monochrome (Android themed icons) only uses alpha: the hash and tag hole are cut out.
const mono = `<defs><mask id="m"><rect width="1024" height="1024" fill="white"/>
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)"><path d="${hash}" stroke="black" stroke-width="44" stroke-linecap="round"/><path d="${tag}" fill="none" stroke="black" stroke-width="20"/><path d="${hole}" fill="black"/></g></mask></defs>
  <g mask="url(#m)">${mark({ cardFill: "#fff", inkStroke: "#fff", tagFill: "#fff", scale: 0.62 })}</g>`;

const svgs: Record<string, [size: number, body: string]> = {
  "icon.png": [1024, gradient + mark({ cardFill: "#fff", inkStroke: NAVY, tagFill: PASTEL_LO })],
  "android-icon-background.png": [1024, gradient],
  // Adaptive icons are cropped to the centre ~66%, so the mark is scaled down.
  "android-icon-foreground.png": [1024, mark({ cardFill: "#fff", inkStroke: NAVY, tagFill: PASTEL_LO, scale: 0.62 })],
  "android-icon-monochrome.png": [1024, mono],
  "splash-icon.png": [1024, mark({ cardFill: NAVY, inkStroke: "#fff", tagFill: PASTEL })],
  "splash-icon-dark.png": [1024, mark({ cardFill: PASTEL, inkStroke: NAVY, tagFill: PASTEL_LO })],
  "favicon.png": [48, gradient + mark({ cardFill: "#fff", inkStroke: NAVY, tagFill: PASTEL_LO })],
};

for (const [name, [size, body]] of Object.entries(svgs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`${OUT}/${name}`, png);
  console.log(name, size);
}
console.log("splash bg", LIGHT_BG, DARK_BG);
