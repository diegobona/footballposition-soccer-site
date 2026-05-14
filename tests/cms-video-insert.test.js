const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const shortcodePath = path.join(repoRoot, "layouts", "shortcodes", "video.html");
const hugoConfigPath = path.join(repoRoot, "hugo.toml");
const source = fs.readFileSync(customJsPath, "utf8");
const shortcode = fs.readFileSync(shortcodePath, "utf8");
const hugoConfig = fs.readFileSync(hugoConfigPath, "utf8");

const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsVideoInsertTestHooks = { buildVideoEmbedHtml, normalizeVideoUrl };})();"
);

const context = {
  console: {
    log() {},
    warn() {},
    error() {},
    debug() {},
    info() {},
  },
  window: {
    CMS_ENHANCER_CONFIG: {},
    localStorage: null,
    sessionStorage: null,
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
  },
  document: {
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        addEventListener() {},
      };
    },
    body: {
      appendChild() {},
    },
    activeElement: null,
  },
  Event,
  InputEvent: Event,
  FocusEvent: Event,
  URL,
  URLSearchParams,
  FormData,
  File,
  Uint8Array,
};

vm.createContext(context);
vm.runInContext(instrumentedSource, context, { filename: customJsPath });

const hooks = context.window.__cmsVideoInsertTestHooks;

assert.strictEqual(hooks.normalizeVideoUrl("youtu.be/abc123xyz"), "https://youtu.be/abc123xyz");
assert.strictEqual(hooks.normalizeVideoUrl("//player.bilibili.com/player.html?bvid=BV123"), "https://player.bilibili.com/player.html?bvid=BV123");
assert.match(
  hooks.buildVideoEmbedHtml("https://img.qunliao.info/clip.mp4", 'Messi "clip"'),
  /<video controls preload="metadata" src="https:\/\/img\.qunliao\.info\/clip\.mp4" title="Messi &quot;clip&quot;"><\/video>/
);
assert.match(
  hooks.buildVideoEmbedHtml("https://www.youtube.com/watch?v=abc123xyz", "Messi clip"),
  /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc123xyz"/
);
assert.match(
  hooks.buildVideoEmbedHtml("https://www.bilibili.com/video/BV123abcDEF", "Bilibili clip"),
  /<iframe src="https:\/\/player\.bilibili\.com\/player\.html\?bvid=BV123abcDEF"/
);
assert.match(shortcode, /youtube-nocookie\.com\/embed/);
assert.match(shortcode, /player\.vimeo\.com\/video/);
assert.match(shortcode, /player\.bilibili\.com\/player\.html\?bvid=/);
assert.match(shortcode, /<video controls preload="metadata"/);
assert.match(hugoConfig, /\[markup\.goldmark\.renderer\][\s\S]*unsafe\s*=\s*true/);

console.log("cms-video-insert tests passed");
