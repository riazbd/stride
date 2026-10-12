/* eslint-disable @typescript-eslint/no-require-imports */
// Generates app icons (PNG) from the STRIDE logo SVG using sharp
const sharp = require("sharp");
const fs = require("fs");

const logo = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bg === "none" ? 0 : 104}" fill="${bg === "none" ? "#fff" : bg}"/>
  <path d="M256 96 L148 330 H206 L256 218 L306 330 H364 Z" fill="${fg}"/>
  <path d="M256 96 L364 330 H306 L256 218 L206 330 H148 Z" fill="none"/>
  <path d="M103 416 L162 284 L221 416 H189 L162 346 L135 416 Z" fill="${fg}" opacity="${bg === "none" ? 1 : 0.55}"/>
</svg>`;

const tasks = [
  { file: "public/icons/icon-192.png", svg: logo("#fc4c02", "#ffffff"), size: 192 },
  { file: "public/icons/icon-512.png", svg: logo("#fc4c02", "#ffffff"), size: 512 },
  { file: "public/icons/maskable-512.png", svg: logo("#fc4c02", "#ffffff"), size: 512 },
  { file: "public/icons/apple-touch-icon.png", svg: logo("#fc4c02", "#ffffff"), size: 180 },
  { file: "public/logo-mark.svg", svg: logo("none", "#fc4c02"), size: 512 },
];

(async () => {
  for (const t of tasks) {
    await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toFile(t.file);
    console.log("wrote", t.file);
  }
  // wordmark svg
  fs.writeFileSync(
    "public/logo-wordmark.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160">
  <text x="8" y="118" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="128" letter-spacing="2" fill="currentColor">STRIDE</text>
</svg>`
  );
  console.log("wrote public/logo-wordmark.svg");
})();
