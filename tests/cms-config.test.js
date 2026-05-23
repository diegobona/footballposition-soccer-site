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

console.log("cms-config tests passed");
