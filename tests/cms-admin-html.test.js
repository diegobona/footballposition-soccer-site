const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const adminHtmlPath = path.join(repoRoot, "static", "admin", "index.html");
const html = fs.readFileSync(adminHtmlPath, "utf8");

assert.match(html, /<html[^>]*translate="no"[^>]*class="notranslate"/, "admin html should opt out of translation");
assert.match(html, /<meta\s+name="google"\s+content="notranslate"/, "admin html should ask browser translation to skip the CMS");
assert.match(html, /<body[^>]*translate="no"[^>]*class="notranslate"/, "admin body should opt out of translation");
assert.match(html, /id="nc-root"[^>]*translate="no"[^>]*class="notranslate"/, "Decap root should opt out of translation");

console.log("cms-admin-html tests passed");
