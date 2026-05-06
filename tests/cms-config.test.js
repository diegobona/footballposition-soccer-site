const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "static", "admin", "config.yml");
const config = fs.readFileSync(configPath, "utf8");

assert.match(
  config,
  /name:\s*"body"[\s\S]*?widget:\s*"markdown"/,
  "CMS body field should keep the markdown widget so Rich Text / Markdown mode stays available"
);

console.log("cms-config tests passed");
