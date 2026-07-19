const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "static", "admin", "config.yml");
const config = fs.readFileSync(configPath, "utf8");

assert.match(
  config,
  /name:\s*"body"[\s\S]*?widget:\s*"toast-ui-editor"/,
  "CMS body field should use the Toast UI widget so the editor runs through the custom Markdown-backed editor"
);

assert.match(
  config,
  /^publish_mode:\s*editorial_workflow\s*$/m,
  "CMS should use editorial workflow so entries can be saved as drafts before publishing"
);

assert.match(
  config,
  /label:\s*"是否从前台隐藏"[\s\S]*?name:\s*"draft"[\s\S]*?widget:\s*"boolean"[\s\S]*?default:\s*false/,
  "CMS should expose a draft boolean that Hugo uses to hide published entries from the live site"
);

assert.match(
  config,
  /options:\s*\[[^\]]*"比赛分析"[^\]]*\]/,
  "CMS category select should include the new 比赛分析 column"
);

console.log("cms-config tests passed");
