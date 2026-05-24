const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const source = fs.readFileSync(customJsPath, "utf8");

const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsToastWidgetTestHooks = { insertMarkdownIntoCms, registerToastUiEditorWidget, splitMarkdownPreviewSegments, normalizeToastUiMarkdown, getToastUiVideoHtmlRenderer, __setActiveToastUiEditorContext(value) { activeToastUiEditorContext = value; } };})();"
);

let registeredWidget = null;
let registeredPreviewTemplate = null;

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
      registerPreviewTemplate(name, component) {
        registeredPreviewTemplate = { name, component };
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
assert.ok(registeredWidget.preview, "Toast UI widget should provide a preview component so Decap can render body content in the preview pane");
assert.ok(registeredPreviewTemplate, "posts collection should register a preview template");
assert.strictEqual(registeredPreviewTemplate.name, "posts", "posts preview template should be registered for the posts collection");

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

let videoSynced = 0;
const fakeVideoEditor = {
  inserted: "",
  focusCalled: false,
  modeChanges: [],
  focus() {
    this.focusCalled = true;
  },
  changeMode(mode) {
    this.modeChanges.push(mode);
  },
  insertText(text) {
    this.inserted += text;
  },
};

hooks.__setActiveToastUiEditorContext({
  root: {},
  editor: fakeVideoEditor,
  syncToField() {
    videoSynced += 1;
  },
});

const videoInserted = hooks.insertMarkdownIntoCms(
  '\n<figure class="video-embed"><iframe src="https://example.com/embed/video"></iframe></figure>\n',
  null,
  { forceMarkdownMode: true }
);

assert.strictEqual(videoInserted, true, "Video HTML insertion should succeed through the active Toast UI editor");
assert.strictEqual(fakeVideoEditor.focusCalled, true, "Video insertion should focus the Toast UI editor first");
assert.deepStrictEqual(
  fakeVideoEditor.modeChanges,
  ["markdown", "wysiwyg"],
  "Video HTML should be inserted by switching Toast UI into markdown mode and then restoring wysiwyg mode"
);
assert.strictEqual(
  fakeVideoEditor.inserted,
  '\n<figure class="video-embed"><iframe src="https://example.com/embed/video"></iframe></figure>\n',
  "Video insertion should pass the exact HTML block through the markdown insertion path"
);
assert.strictEqual(videoSynced, 1, "Video insertion should sync the field value back to Decap");

const previewSegments = JSON.parse(JSON.stringify(hooks.splitMarkdownPreviewSegments(`
## Heading

Before video

<figure class="video-embed"><iframe src="https://example.com/embed/1"></iframe></figure>

After video
`)));

assert.deepStrictEqual(
  previewSegments,
  [
    {
      type: "markdown",
      content: "\n## Heading\n\nBefore video\n\n",
    },
    {
      type: "video",
      content: '<figure class="video-embed"><iframe src="https://example.com/embed/1"></iframe></figure>',
    },
    {
      type: "markdown",
      content: "After video\n",
    },
  ],
  "Preview should automatically split Markdown and embedded video blocks"
);

const previewSegmentsWithEscapedLines = JSON.parse(JSON.stringify(hooks.splitMarkdownPreviewSegments(`
Before video
\
<figure class="video-embed"><iframe src="https://example.com/embed/escaped"></iframe></figure>
\
After video
`)));

assert.deepStrictEqual(
  previewSegmentsWithEscapedLines,
  [
    {
      type: "markdown",
      content: "\nBefore video\n",
    },
    {
      type: "video",
      content: '<figure class="video-embed"><iframe src="https://example.com/embed/escaped"></iframe></figure>',
    },
    {
      type: "markdown",
      content: "After video\n",
    },
  ],
  "Preview should automatically remove isolated backslash lines around embedded videos"
);

assert.strictEqual(
  hooks.normalizeToastUiMarkdown("Intro\n\\\\\n<figure class=\"video-embed\"><iframe src=\"https://example.com/embed/3\"></iframe></figure>\n\\\\\nOutro"),
  "Intro\n\n<figure class=\"video-embed\"><iframe src=\"https://example.com/embed/3\"></iframe></figure>\nOutro",
  "Markdown normalization should remove standalone backslash lines around video embeds"
);

const previewTree = registeredWidget.preview.render.call({
  props: {
    value: "Intro\n\\\n<figure class=\"video-embed\"><iframe src=\"https://example.com/embed/2\"></iframe></figure>\n\\\nOutro",
  },
});

const leadingMarkdownNode = previewTree.children[0].tag.render.call({
  props: previewTree.children[0].props,
});
const trailingMarkdownNode = previewTree.children[2].tag.render.call({
  props: previewTree.children[2].props,
});

assert.strictEqual(previewTree.tag, "div", "Toast UI preview should render a wrapper element");
assert.strictEqual(previewTree.children.length, 3, "Toast UI preview should render separate nodes for Markdown and video segments");
assert.strictEqual(leadingMarkdownNode.tag, "div", "Leading Markdown preview should render a div host");
assert.strictEqual(leadingMarkdownNode.props.className, "cms-toast-preview-markdown-segment", "Leading Markdown should render through the Markdown preview component");
assert.strictEqual(previewTree.children[1].tag, "div", "Video segments should render as a plain div wrapper");
assert.strictEqual(
  previewTree.children[1].props.dangerouslySetInnerHTML.__html,
  '<figure class="video-embed"><iframe src="https://example.com/embed/2"></iframe></figure>',
  "Video segments should render the original embed HTML automatically"
);
assert.strictEqual(trailingMarkdownNode.tag, "div", "Trailing Markdown preview should render a div host");
assert.strictEqual(trailingMarkdownNode.props.className, "cms-toast-preview-markdown-segment", "Trailing Markdown should still render through the Markdown preview component");

const videoHtmlRenderer = hooks.getToastUiVideoHtmlRenderer();
assert.ok(videoHtmlRenderer.htmlBlock.figure, "Video HTML renderer should support figure blocks");
assert.ok(videoHtmlRenderer.htmlBlock.iframe, "Video HTML renderer should support iframe blocks");
assert.ok(videoHtmlRenderer.htmlBlock.video, "Video HTML renderer should support video blocks");

let viewerFactoryOptions = null;
let editorConstructorOptions = null;
const fakeMountedEditor = {
  getMarkdown() {
    return "";
  },
  getEditorElements() {
    return null;
  },
};
context.window.toastui = {
  Editor: function EditorConstructor(options) {
    editorConstructorOptions = options;
    return fakeMountedEditor;
  },
};
context.window.toastui.Editor.factory = function factory(options) {
  viewerFactoryOptions = options;
  return {
    setMarkdown() {},
    destroy() {},
  };
};

previewTree.children[0].tag.renderPreviewMarkdown.call({
  props: previewTree.children[0].props,
  previewHost: {},
});

assert.ok(viewerFactoryOptions, "Markdown preview segment should create a Toast UI viewer");
assert.ok(
  viewerFactoryOptions.customHTMLRenderer && viewerFactoryOptions.customHTMLRenderer.htmlBlock && viewerFactoryOptions.customHTMLRenderer.htmlBlock.iframe,
  "Markdown preview segment should pass the custom video HTML renderer to Toast UI viewer"
);

registeredWidget.control.componentDidMount.call({
  editorHost: {
    setAttribute() {},
  },
  props: {
    value: "",
    onChange() {},
  },
  activateEditor() {},
  syncFromEditor() {},
  handleImageBlob() {
    return false;
  },
});

assert.ok(editorConstructorOptions, "Toast UI control should create the editor instance");
assert.ok(
  editorConstructorOptions.customHTMLRenderer && editorConstructorOptions.customHTMLRenderer.htmlBlock && editorConstructorOptions.customHTMLRenderer.htmlBlock.iframe,
  "Toast UI editor should receive the custom video HTML renderer"
);

const postsPreviewTree = registeredPreviewTemplate.component.render.call({
  props: {
    entry: {
      getIn(path) {
        if (path.join(".") === "data.title") {
          return "Preview title";
        }
        if (path.join(".") === "data.cover.image") {
          return "/images/example.jpg";
        }
        return "";
      },
    },
    widgetFor(name) {
      return { kind: "widget", name };
    },
    getAsset(value) {
      return {
        toString() {
          return value;
        },
      };
    },
  },
});

assert.strictEqual(postsPreviewTree.tag, "article", "Posts preview should render an article wrapper");
assert.strictEqual(postsPreviewTree.children.length, 2, "Posts preview should render title and body only");
assert.strictEqual(postsPreviewTree.children[0].tag, "h1", "Posts preview should still render the entry title");
assert.strictEqual(postsPreviewTree.children[1].tag, "div", "Posts preview should render the body container");
assert.strictEqual(postsPreviewTree.children[1].children.name, "body", "Posts preview body should still come from the body widget");

console.log("cms-toast-widget tests passed");
