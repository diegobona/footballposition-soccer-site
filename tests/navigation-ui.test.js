const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8");

const config = read("hugo.toml");
const css = read("assets", "css", "extended", "custom.css");
const overview = read("content", "overview", "_index.md");
const baseTemplate = read("layouts", "_default", "baseof.html");
const directoryPath = path.join(repoRoot, "layouts", "shortcodes", "position-directory.html");

assert.strictEqual(
  (config.match(/\[\[menu\.main\]\]/g) || []).length,
  3,
  "Primary navigation should contain only three top-level sections"
);

for (const [name, url] of [
  ["Positions", "/overview/"],
  ["Tactical Previews", "/tactical-preview/"],
  ["Match Analysis", "/match-analysis/"],
]) {
  assert.match(
    config,
    new RegExp(`name\\s*=\\s*"${name}"[\\s\\S]*?url\\s*=\\s*"${url}"`),
    `${name} should be a top-level navigation item`
  );
}

assert.doesNotMatch(
  overview,
  /Here is a cross-position overview|Explore positions by area/,
  "Positions page should not repeat explanatory headings above the directory"
);
assert.ok(fs.existsSync(directoryPath), "Position pages should share one directory component");
const positionDirectory = fs.readFileSync(directoryPath, "utf8");
for (const label of ["Position Overview", "Attacking Position", "Midfield Position", "Defensive Position"]) {
  assert.ok(positionDirectory.includes(`"label" "${label}"`), `${label} should appear in the shared position directory`);
}
for (const url of ["/overview/", "/attacking-positions/", "/midfield-positions/", "/defensive-positions/"]) {
  assert.ok(positionDirectory.includes(`"url" "${url}"`), `${url} should appear in the shared position directory`);
}
assert.match(positionDirectory, /eq \$current \.key/, "Position directory should derive its current item from the page parameter");
assert.match(positionDirectory, /aria-current="page"/, "Selected position directory item should expose its current state");

for (const [section, current] of [
  ["overview", "overview"],
  ["attacking-positions", "attacking"],
  ["midfield-positions", "midfield"],
  ["defensive-positions", "defensive"],
]) {
  const sectionContent = read("content", section, "_index.md");
  assert.ok(
    sectionContent.includes(`{{< position-directory current="${current}" >}}`),
    `${section} should render the shared directory with its selected item`
  );
  assert.doesNotMatch(
    sectionContent,
    /Here is the content related to|description:\s*attacking-positions/,
    `${section} should not render the old title description or explanatory copy`
  );
}

assert.match(baseTemplate, /printf " section-%s" \.Section/, "Pages should expose their section as a body class");
for (const section of ["overview", "attacking-positions", "midfield-positions", "defensive-positions"]) {
  assert.ok(css.includes(`body.section-${section} .page-header`), `${section} should hide its repeated page heading`);
}
assert.match(css, /body\.section-defensive-positions \.page-header\s*\{[^}]*display:\s*none/, "Position pages should hide repeated page titles");
assert.match(css, /\.position-directory\s*\{[^}]*grid-template-columns:\s*repeat\(4,/, "Position directory should use four equal desktop columns");

assert.match(config, /ShowPageNums\s*=\s*true/, "Pagination should display page context");
assert.match(css, /\.page-footer\s*\{[^}]*grid-column:\s*1 \/ -1/, "Pagination footer should span the full article grid");
assert.match(css, /\.pagination a\s*\{[\s\S]*?min-height:\s*58px/, "Pagination controls should have a large click target");
assert.match(css, /\.pagination a\s*\{[\s\S]*?font-size:\s*1\.05rem/, "Pagination labels should be prominent");
assert.match(css, /\.pagination a\s*\{[\s\S]*?box-shadow:/, "Pagination controls should stand out from the page");
assert.match(css, /\.pagination a\s*\{[\s\S]*?flex:\s*0 1 280px/, "Desktop pagination should preserve left/right edge alignment");
assert.match(css, /\.pagination a:focus-visible/, "Pagination controls should expose a keyboard focus state");

console.log("navigation-ui tests passed");
