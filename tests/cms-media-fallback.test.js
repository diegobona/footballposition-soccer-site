const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(repoRoot, "static", "cms-media-sw.js"), "utf8");
const customJs = fs.readFileSync(path.join(repoRoot, "static", "admin", "custom.js"), "utf8");

assert.match(worker, /raw\.githubusercontent\.com/, "media service worker should fall back to GitHub raw media");
assert.match(worker, /caches\.match\(event\.request\)/, "media service worker should serve pasted media from Cache Storage first");
assert.match(worker, /fetchRawMedia/, "media service worker should try remote repository media before local Hugo media");
assert.match(worker, /config\.publicFolder/, "media service worker should only handle configured public media paths");
assert.match(customJs, /registerMediaFallbackServiceWorker/, "CMS custom script should register the media fallback service worker");
assert.match(customJs, /cms-media-sw\.js\?/, "CMS custom script should pass repo config to the service worker");
assert.match(customJs, /cacheImageForLocalPreview/, "CMS custom script should cache uploaded pasted media for local preview");
assert.match(customJs, /caches\.open\("cms-pasted-media-v1"\)/, "CMS custom script should store pasted media in the browser cache");

console.log("cms-media-fallback tests passed");
