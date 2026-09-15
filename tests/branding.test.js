const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8");

const config = read("hugo.toml");
const head = read("layouts", "partials", "head.html");
const css = read("assets", "css", "extended", "custom.css");

assert.match(
  config,
  /^title\s*=\s*['"]Soccer Positions['"]/m,
  "Browser and search title should use the audience-focused site name"
);

assert.match(
  config,
  /\[params\.label\][\s\S]*?text\s*=\s*"Soccer Positions"[\s\S]*?icon\s*=\s*"brand\/football-position-mark\.svg"/,
  "Header should pair the branded position mark with the unified site name"
);

assert.match(
  config,
  /\[params\.homeInfoParams\][\s\S]*?Title\s*=\s*"Soccer Positions – Master Every Role on the Pitch \| Position Guides, Drills & Pro Tips"/,
  "Homepage heading should start with the unified site name"
);

for (const asset of [
  "favicon.svg",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "safari-pinned-tab.svg",
  "site.webmanifest",
]) {
  assert.ok(fs.existsSync(path.join(repoRoot, "static", asset)), `${asset} should exist`);
}

const mark = read("assets", "brand", "football-position-mark.svg");
assert.match(mark, /viewBox="0 0 64 64"/, "Logo mark should have a reusable square viewBox");
assert.match(mark, /aria-hidden="true"/, "Decorative header mark should not duplicate the brand name for screen readers");
assert.match(
  mark,
  /<circle[^>]+data-position-node="true"/,
  "Logo should contain a valid XML attribute for the distinct tactical position node"
);

for (const [name, svg] of [
  ["header logo", mark],
  ["favicon", read("static", "favicon.svg")],
]) {
  assert.doesNotMatch(svg, /linearGradient|radialGradient/, `${name} should use a simple flat color`);
  assert.doesNotMatch(svg, /stroke-dasharray/, `${name} should not contain a decorative running path`);
  assert.ok(
    (svg.match(/<(?:rect|path|circle)\b/g) || []).length <= 5,
    `${name} should use no more than five visible shapes`
  );
}

assert.match(head, /rel="manifest"[^>]+site\.webmanifest/, "Head should expose the web app manifest");
assert.match(config, /theme_color\s*=\s*"#0B5D3B"/, "Browser chrome should use the primary pitch green");
assert.match(css, /\.logo img\s*\{[\s\S]*?width:\s*36px/, "Header mark should have a stable, legible display size");
assert.doesNotMatch(css, /\.logo a::before/, "The old CSS-drawn generic ball should be removed");

console.log("branding tests passed");
