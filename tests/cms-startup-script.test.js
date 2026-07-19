const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "football-start-cms-admin.bat");
const script = fs.readFileSync(scriptPath, "utf8");

assert.match(
  script,
  /set "ADMIN_URL=http:\/\/localhost:1313\/admin\/\?v=%RANDOM%%RANDOM%"/,
  "CMS startup script should generate a fresh cache-busted admin URL on every launch"
);

console.log("cms-startup-script tests passed");
