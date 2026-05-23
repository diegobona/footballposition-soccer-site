const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const source = fs.readFileSync(customJsPath, "utf8");

const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsToastWidgetTestHooks = { insertMarkdownIntoCms, registerToastUiEditorWidget, __setActiveToastUiEditorContext(value) { activeToastUiEditorContext = value; } };})();"
);

let registeredWidget = null;

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
    CMS: {
      registerWidget(name, control) {
        registeredWidget = { name, control };
      },
    },
    createClass(spec) {
      return spec;
    },
    h(tag, props, children) {
      return { tag, props, children };
    },
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
      contains() {
        return true;
      },
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

const hooks = context.window.__cmsToastWidgetTestHooks;

assert.ok(registeredWidget, "Toast UI widget should register itself when CMS globals exist");
assert.strictEqual(registeredWidget.name, "toast-ui-editor", "Toast UI widget should register under the expected field name");

let synced = 0;
const fakeEditor = {
  inserted: "",
  focusCalled: false,
  focus() {
    this.focusCalled = true;
  },
  insertText(text) {
    this.inserted += text;
  },
};

hooks.__setActiveToastUiEditorContext({
  root: {},
  editor: fakeEditor,
  syncToField() {
    synced += 1;
  },
});

const inserted = hooks.insertMarkdownIntoCms("\n![img](/images/test.png)\n", null);

assert.strictEqual(inserted, true, "Markdown insertion should succeed through the active Toast UI editor");
assert.strictEqual(fakeEditor.focusCalled, true, "Toast UI editor should be focused before inserting text");
assert.strictEqual(fakeEditor.inserted, "\n![img](/images/test.png)\n", "Toast UI editor should receive the exact Markdown payload");
assert.strictEqual(synced, 1, "Toast UI editor insertion should sync the field value back to Decap");

console.log("cms-toast-widget tests passed");
