const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8");

const config = read("hugo.toml");
const css = read("assets", "css", "extended", "custom.css");
const homeInfoPath = path.join(repoRoot, "layouts", "partials", "home_info.html");

assert.match(
  config,
  /defaultTheme\s*=\s*"light"/,
  "First-time visitors should see the light theme"
);

assert.ok(
  fs.existsSync(homeInfoPath),
  "Homepage should override the generic theme article with a dedicated introduction section"
);

const homeInfo = fs.readFileSync(homeInfoPath, "utf8");
assert.match(homeInfo, /<section class="home-info"/, "Site introduction should use section semantics, not an article card");
assert.doesNotMatch(homeInfo, /<article\b/, "Site introduction should not look or behave like a post article");
assert.doesNotMatch(
  homeInfo,
  /home-info__eyebrow|Football Position Learning Hub/,
  "Compact introduction should not repeat the learning-hub label"
);
assert.match(homeInfo, /href="\/overview\/"/, "Site introduction should guide readers into the position directory");

assert.match(
  css,
  /body\.home \.home-info\s*\{[\s\S]*?grid-column:\s*1 \/ -1/,
  "Homepage introduction should span the full article grid"
);
assert.match(
  css,
  /body\.home \.home-info\s*\{[\s\S]*?box-shadow:\s*none/,
  "Homepage introduction should not reuse the floating article-card shadow"
);
assert.doesNotMatch(
  css,
  /body\.home \.home-info \+ \.post-entry\s*\{[^}]*grid-column:/,
  "First article should flow into the normal article grid below the introduction"
);
assert.doesNotMatch(
  css,
  /body\.home \.home-info::after/,
  "Introduction should not include an unexplained centre-circle decoration"
);

const heroRule = css.match(/body\.home \.home-info\s*\{([\s\S]*?)\}/)?.[1] || "";
const heroMinHeight = Number(heroRule.match(/min-height:\s*(\d+)px/)?.[1]);
assert.ok(heroMinHeight <= 240, "Introduction should use a compact desktop height");

const headlineRule = css.match(/body\.home \.home-info \.entry-header h1\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(
  headlineRule,
  /font-size:\s*clamp\([^;]*2\.35rem\)/,
  "Introduction headline should have a smaller maximum size"
);

const contentRule = css.match(/body\.home \.home-info \.entry-content\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(contentRule, /font-size:\s*0\.92rem/, "Introduction copy should be smaller");

const actionRule = css.match(/body\.home \.home-info__action\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(actionRule, /font-size:\s*0\.86rem/, "Introduction action should be more compact");

console.log("homepage hero tests passed");
