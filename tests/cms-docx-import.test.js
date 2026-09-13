const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const source = fs.readFileSync(customJsPath, "utf8");
const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsDocxImportTestHooks = { isDocxFile, convertDocxToHtml, createDocxImageFile };})();"
);

let registeredWidget = null;
let imageConverter = null;

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
      registerWidget(name, control, preview) {
        registeredWidget = { name, control, preview };
      },
      registerPreviewTemplate() {},
    },
    createClass(spec) {
      return spec;
    },
    h(tag, props, children) {
      return { tag, props: props || {}, children };
    },
    mammoth: {
      images: {
        imgElement(converter) {
          imageConverter = converter;
          return converter;
        },
      },
      async convertToHtml(input, options) {
        assert.ok(input.arrayBuffer instanceof ArrayBuffer, "Mammoth should receive the DOCX ArrayBuffer");
        assert.ok(options.styleMap.includes("p[style-name='Heading 1'] => h2:fresh"));
        const attrs = await options.convertImage({
          contentType: "image/png",
          async readAsBase64String() {
            return "AQIDBA==";
          },
        });
        return {
          value: `<h2>Shape</h2><p>Body</p><img src="${attrs.src}">`,
          messages: [{ message: "Unsupported floating text box" }],
        };
      },
    },
    localStorage: null,
    sessionStorage: null,
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    confirm() {
      return true;
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
  Blob,
  ArrayBuffer,
  Uint8Array,
};

vm.createContext(context);
vm.runInContext(instrumentedSource, context, { filename: customJsPath });

const hooks = context.window.__cmsDocxImportTestHooks;

assert.strictEqual(hooks.isDocxFile({ name: "tactics.docx" }), true);
assert.strictEqual(hooks.isDocxFile({ name: "tactics.doc" }), false);
assert.strictEqual(hooks.isDocxFile({ name: "tactics.pdf" }), false);
assert.ok(registeredWidget, "DOCX import should be attached to the registered Toast UI widget");

const widgetTree = registeredWidget.control.render.call({
  props: { classNameWrapper: "" },
  setEditorHost() {},
  setDocxFileInput() {},
  handleDocxImportClick() {},
  handleDocxFileChange() {},
  handleVideoInsert() {},
  state: { importingDocx: false },
});
const actionChildren = widgetTree.children[1].children;
assert.ok(
  actionChildren.some((node) => node && node.props && node.props["data-cms-docx-import"] === "button"),
  "Toast UI widget should render a one-click DOCX import button"
);
assert.ok(
  actionChildren.some((node) => node && node.tag === "input" && node.props && node.props.accept.includes(".docx")),
  "Toast UI widget should render a hidden DOCX file picker"
);

async function run() {
  const uploadedFiles = [];
  const docxFile = new File([Uint8Array.from([80, 75, 3, 4])], "Match Plan.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const result = await hooks.convertDocxToHtml(docxFile, async (file) => {
    uploadedFiles.push(file);
    return { publicUrl: "https://media.footballposition.soccer/uploads/docx-image.png" };
  });

  assert.ok(imageConverter, "DOCX conversion should register an embedded-image converter");
  assert.strictEqual(uploadedFiles.length, 1, "every embedded DOCX image should be uploaded once");
  assert.strictEqual(uploadedFiles[0].name, "match-plan-image-1.png");
  assert.strictEqual(uploadedFiles[0].type, "image/png");
  assert.strictEqual(uploadedFiles[0].size, 4);
  assert.strictEqual(
    result.html,
    '<h2>Shape</h2><p>Body</p><img src="https://media.footballposition.soccer/uploads/docx-image.png">'
  );
  assert.strictEqual(result.imageCount, 1);
  assert.deepStrictEqual(Array.from(result.warnings), ["Unsupported floating text box"]);

  await assert.rejects(
    () => hooks.convertDocxToHtml(new File(["bad"], "notes.doc", { type: "application/msword" }), async () => ({})),
    /\.docx/
  );

  console.log("cms-docx-import tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
