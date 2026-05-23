const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const source = fs.readFileSync(customJsPath, "utf8");

const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsImagePasteTestHooks = { handleImageInsert, handleClipboardPaste, handleRichTextClipboardPaste, handleRichTextImageInsert, buildClipboardPasteMarkdown, buildClipboardPasteRichHtml, insertWithTextarea, insertHtmlIntoCms, insertMarkdownIntoCms, insertViaSlateRawEditor, handleVideoInsert, setNativeValue, uploadImage, buildImageInsertSourceContext, rememberEditorSourceContext, resolvePreferredInsertSourceContext, resolveMarkdownInsertOffset, resolveSlateContextFromGlobalOffset, __setLastEditorSourceContext(value) { lastEditorSourceContext = value; } };})();"
);

const listeners = [];
const execCommands = [];

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: text,
  };
}

function createElementNode(tagName, attributes, children) {
  return {
    nodeType: 1,
    tagName,
    childNodes: children || [],
    getAttribute(name) {
      return (attributes && attributes[name]) || "";
    },
  };
}

class FakeTextarea {
  constructor(value) {
    this._value = value;
    this.selectionStart = value.length;
    this.selectionEnd = value.length;
    this.tagName = "TEXTAREA";
    this.events = [];
    this.focused = false;
    this.nativeSetterCalled = false;
    this.directSetterCalled = false;
    this.parentElement = null;

    Object.defineProperty(this, "value", {
      configurable: true,
      get: () => this._value,
      set: (nextValue) => {
        this.directSetterCalled = true;
        this._value = nextValue;
      },
    });
  }

  focus() {
    this.focused = true;
  }

  closest(selector) {
    return selector.includes("textarea") ? this : null;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

class FakeEditable {
  constructor(slateBlock) {
    this.tagName = "DIV";
    this.isContentEditable = true;
    this.parentElement = null;
    this.events = [];
    this.focused = false;
    if (slateBlock) {
      this.__reactFiber$line = {
        memoizedProps: {
          element: slateBlock,
        },
        return: null,
      };
    }
  }

  closest(selector) {
    return selector.includes("contenteditable") ? this : null;
  }

  contains(node) {
    return node === this || node.parentElement === this;
  }

  getAttribute(name) {
    if (name === "contenteditable") {
      return "true";
    }
    return null;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }

  focus() {
    this.focused = true;
  }
}

class FakeSlateLine extends FakeEditable {
  constructor(slateBlock) {
    super(slateBlock);
    this.parentElement = null;
  }

  getAttribute(name) {
    if (name === "data-slate-node") {
      return "element";
    }
    return super.getAttribute(name);
  }
}

Object.defineProperty(FakeTextarea.prototype, "value", {
  configurable: true,
  get() {
    return this._value;
  },
  set(nextValue) {
    this.nativeSetterCalled = true;
    this._value = nextValue;
  },
});

const context = {
  console: {
    log() {},
    warn() {},
    error() {},
    debug() {},
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
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, options });
    },
    execCommand(command, _ui, value) {
      execCommands.push({ command, value });
      return true;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    createElement() {
      return { style: {}, hidden: false };
    },
    body: {
      appendChild() {},
    },
    activeElement: null,
  },
  Event: FakeEvent,
  InputEvent: FakeEvent,
  FocusEvent: FakeEvent,
  URL,
  URLSearchParams,
  FormData,
  File,
  Uint8Array,
};

vm.createContext(context);
vm.runInContext(instrumentedSource, context, { filename: customJsPath });

function testImagePasteEventIsFullyClaimed() {
  const pasteListener = listeners.find((listener) => listener.type === "paste");
  assert.ok(pasteListener, "paste listener should be registered");

  let prevented = false;
  let propagationStopped = false;
  let immediatePropagationStopped = false;

  pasteListener.listener({
    target: textarea,
    clipboardData: {
      items: [
        {
          type: "image/png",
          getAsFile() {
            return {
              name: "claimed.png",
              type: "image/png",
              size: 4,
              async arrayBuffer() {
                return Uint8Array.from([1, 2, 3, 4]).buffer;
              },
            };
          },
        },
      ],
    },
    composedPath() {
      return [textarea];
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
    stopImmediatePropagation() {
      immediatePropagationStopped = true;
    },
  });

  assert.strictEqual(prevented, true, "image paste should prevent the browser's default paste");
  assert.strictEqual(propagationStopped, true, "image paste should stop propagation so Decap/Slate does not also handle it");
  assert.strictEqual(immediatePropagationStopped, true, "image paste should stop sibling document paste handlers");
}

const textarea = new FakeTextarea("hello");
const onChangeCalls = [];
textarea.__reactFiber$test = {
  memoizedProps: {
    field: {
      get(key) {
        return key === "name" ? "body" : undefined;
      },
    },
    onChange(value) {
      onChangeCalls.push(value);
    },
  },
  return: null,
};
const inserted = context.window.__cmsImagePasteTestHooks.insertWithTextarea(textarea, "\n![img](/img.png)\n");

assert.strictEqual(inserted, true);
assert.strictEqual(textarea.value, "hello\n![img](/img.png)\n");
assert.strictEqual(textarea.nativeSetterCalled, true, "textarea updates should use the native prototype setter so React notices the input event");
assert.strictEqual(textarea.directSetterCalled, false, "textarea updates should not assign directly to the instance value tracker");
assert.deepStrictEqual(onChangeCalls, ["hello\n![img](/img.png)\n"], "textarea updates should call Decap's field onChange so entryDraft.hasChanged becomes true");
assert.deepStrictEqual(textarea.events, ["input", "change", "blur"]);
assert.strictEqual(textarea.focused, true);
testImagePasteEventIsFullyClaimed();

function testPasteContextUsesSelectionAnchorNode() {
  const firstBlock = { type: "paragraph", children: [{ text: "first" }] };
  const secondBlock = { type: "paragraph", children: [{ text: "second" }] };
  const editorRoot = new FakeEditable(firstBlock);
  const lineNode = new FakeSlateLine(secondBlock);
  lineNode.parentElement = editorRoot;
  lineNode.__reactFiber$line.return = {
    memoizedProps: {
      value: [firstBlock, secondBlock],
      onChange() {},
    },
    return: null,
  };

  const originalGetSelection = context.window.getSelection;
  context.window.getSelection = () => ({
    anchorNode: lineNode,
    rangeCount: 0,
  });

  try {
    const sourceContext = context.window.__cmsImagePasteTestHooks.buildImageInsertSourceContext({
      target: editorRoot,
      composedPath() {
        return [editorRoot];
      },
    });

    assert.strictEqual(
      sourceContext.slateBlock,
      secondBlock,
      "paste context should use the selection anchor node instead of the editor root event target"
    );
    assert.strictEqual(sourceContext.selectionOffset, null, "global DOM offset should not be used when a Slate block is available");
  } finally {
    context.window.getSelection = originalGetSelection;
  }
}

testPasteContextUsesSelectionAnchorNode();

async function testUploadsImagesThroughR2Worker() {
  const uploadCalls = [];
  const uploadContext = {
    ...context,
    fetch: async (url, options) => {
      uploadCalls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { url: "https://media.footballposition.soccer/uploads/2026/05/r2.png" };
        },
      };
    },
  };
  uploadContext.window = {
    ...context.window,
    CMS_ENHANCER_CONFIG: {
      mediaUploadEndpoint: "https://cms-upload.footballposition.soccer/upload",
      mediaPublicBaseUrl: "https://media.footballposition.soccer",
    },
    localStorage: {
      length: 1,
      key(index) {
        return index === 0 ? "decap-cms-user" : null;
      },
      getItem(key) {
        return key === "decap-cms-user" ? JSON.stringify({ token: "github-token", backend: "github" }) : null;
      },
    },
    sessionStorage: null,
    btoa: context.window.btoa,
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
  };
  vm.createContext(uploadContext);
  vm.runInContext(instrumentedSource, uploadContext, { filename: customJsPath });

  const file = new File([Uint8Array.from([1, 2, 3, 4])], "R2 Upload.PNG", { type: "image/png" });

  const result = await uploadContext.window.__cmsImagePasteTestHooks.uploadImage(file);
  assert.strictEqual(result.publicUrl, "https://media.footballposition.soccer/uploads/2026/05/r2.png");
  assert.strictEqual(uploadCalls.length, 1, "image uploads should call the configured R2 upload worker once");
  assert.strictEqual(uploadCalls[0].url, "https://cms-upload.footballposition.soccer/upload");
  assert.strictEqual(uploadCalls[0].options.method, "POST");
  assert.strictEqual(uploadCalls[0].options.headers.Authorization, "Bearer github-token");
  assert.ok(uploadCalls[0].options.body instanceof FormData, "R2 uploads should send multipart form data");
  assert.ok(
    !String(uploadCalls[0].url).includes("api.github.com"),
    "R2 uploads should not use GitHub Contents API"
  );
}

async function testFallsBackToInlineImageWhenUploadFails() {
  const fallbackTextarea = new FakeTextarea("start");
  const fallbackOnChangeCalls = [];
  fallbackTextarea.__reactFiber$test = {
    memoizedProps: {
      field: {
        get(key) {
          return key === "name" ? "body" : undefined;
        },
      },
      value: "start",
      onChange(value) {
        fallbackOnChangeCalls.push(value);
      },
    },
    return: null,
  };

  const file = {
    name: "network-down.png",
    type: "image/png",
    size: 4,
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3, 4]).buffer;
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleImageInsert([file], {
    sourceNode: fallbackTextarea,
    activeElement: fallbackTextarea,
    path: [fallbackTextarea],
  });

  assert.strictEqual(
    fallbackTextarea.value,
    "start\n![network down](data:image/png;base64,AQIDBA==)\n",
    "image insertion should update the visible markdown editor text"
  );
  assert.deepStrictEqual(
    fallbackOnChangeCalls,
    ["start\n![network down](data:image/png;base64,AQIDBA==)\n"],
    "fallback insertion should also notify Decap so the entry can be published"
  );
}

async function testUpdatesSlateRawMarkdownEditor() {
  const slateChangeCalls = [];
  const slateValue = [
    { type: "paragraph", children: [{ text: "before" }] },
    { type: "paragraph", children: [{ text: "middle" }] },
    { type: "paragraph", children: [{ text: "after" }] },
  ];
  const editable = new FakeEditable(slateValue[1]);
  const editorFiber = {
    memoizedProps: {
      value: slateValue,
      onChange(value) {
        slateChangeCalls.push(value);
      },
    },
    return: null,
  };
  editable.__reactFiber$line.return = editorFiber;

  const file = {
    name: "slate-raw.png",
    type: "image/png",
    size: 4,
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3, 4]).buffer;
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleImageInsert([file], {
    sourceNode: editable,
    activeElement: editable,
    path: [editable],
    slateBlock: slateValue[1],
    slateBlockOffset: "middle".length,
  });

  assert.strictEqual(slateChangeCalls.length, 1, "raw markdown Slate editor should receive a visible value update");
  assert.strictEqual(
    slateChangeCalls[0].map((node) => node.children[0].text).join("\n"),
    "before\nmiddle\n![slate raw](data:image/png;base64,AQIDBA==)\n\nafter",
    "raw markdown Slate value should insert image markdown at the captured cursor offset"
  );
}

async function testPreservesExistingSlateImageRows() {
  const slateChangeCalls = [];
  const oldImageRow = { type: "paragraph", children: [{ text: "![old image](https://media.example/old.png)" }] };
  const targetRow = { type: "paragraph", children: [{ text: "target" }] };
  const laterImageRow = { type: "paragraph", children: [{ text: "![later image](https://media.example/later.png)" }] };
  const slateValue = [
    { type: "paragraph", children: [{ text: "intro" }] },
    oldImageRow,
    targetRow,
    laterImageRow,
  ];
  const editable = new FakeEditable(targetRow);
  editable.__reactFiber$line.return = {
    memoizedProps: {
      value: slateValue,
      onChange(value) {
        slateChangeCalls.push(value);
      },
    },
    return: null,
  };

  const file = {
    name: "new-image.png",
    type: "image/png",
    size: 4,
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3, 4]).buffer;
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleImageInsert([file], {
    sourceNode: editable,
    activeElement: editable,
    path: [editable],
    slateBlock: targetRow,
    slateBlockOffset: "target".length,
  });

  assert.strictEqual(slateChangeCalls.length, 1);
  const nextValue = slateChangeCalls[0];
  assert.ok(nextValue.includes(oldImageRow), "existing image rows before the insertion point should be preserved by object identity");
  assert.ok(nextValue.includes(laterImageRow), "existing image rows after the insertion point should be preserved by object identity");
  assert.strictEqual(
    nextValue.map((node) => node.children[0].text).join("\n"),
    "intro\n![old image](https://media.example/old.png)\ntarget\n![new image](data:image/png;base64,AQIDBA==)\n\n![later image](https://media.example/later.png)"
  );
}

async function testHandlesMixedHtmlPasteWithImagesWithoutCrashingDecap() {
  const textarea = new FakeTextarea("start");
  const onChangeCalls = [];
  textarea.__reactFiber$test = {
    memoizedProps: {
      field: {
        get(key) {
          return key === "name" ? "body" : undefined;
        },
      },
      value: "start",
      onChange(value) {
        onChangeCalls.push(value);
      },
    },
    return: null,
  };

  const file = {
    name: "clipboard-image.png",
    type: "image/png",
    size: 4,
    async arrayBuffer() {
      return Uint8Array.from([5, 6, 7, 8]).buffer;
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleClipboardPaste(
    [file],
    '<p>Intro text</p><img src="https://images.example/hero.png" alt="Hero image"><p>Middle text</p><img src="blob:https://editor.local/clipboard" alt="Clipboard image"><p>End text</p>',
    "Intro text\nMiddle text\nEnd text",
    {
      sourceNode: textarea,
      activeElement: textarea,
      path: [textarea],
    }
  );

  assert.strictEqual(
    textarea.value,
    "start\nIntro text\n\n![hero image](https://images.example/hero.png)\n\nMiddle text\n\n![clipboard image](data:image/png;base64,BQYHCA==)\n\nEnd text\n",
    "mixed HTML paste should be converted to Markdown so Decap never receives the crashing image node paste"
  );
  assert.deepStrictEqual(
    onChangeCalls,
    ["start\nIntro text\n\n![hero image](https://images.example/hero.png)\n\nMiddle text\n\n![clipboard image](data:image/png;base64,BQYHCA==)\n\nEnd text\n"],
    "mixed HTML paste should still notify Decap about the updated entry body"
  );
}

async function testPreservesFormattingFromRichHtmlPaste() {
  const originalDOMParser = context.DOMParser;
  context.DOMParser = class FakeDOMParser {
    parseFromString() {
      return {
        body: createElementNode("body", {}, [
          createElementNode("p", {}, [createTextNode("The 2026 World Cup is about to begin.")]),
          createElementNode("p", {}, [
            createTextNode("Lionel "),
            createElementNode("strong", {}, [createTextNode("Messi")]),
            createTextNode(" and "),
            createElementNode("a", { href: "https://example.com/lautaro" }, [createTextNode("Lautaro Martinez")]),
            createTextNode(" lead the squad."),
          ]),
          createElementNode("h2", {}, [createTextNode("Argentina Base Formation")]),
          createElementNode("ol", {}, [
            createElementNode("li", {}, [createTextNode("Keep the ball")]),
            createElementNode("li", {}, [createTextNode("Press after loss")]),
          ]),
          createElementNode("img", { src: "blob:https://editor.local/chart", alt: "Argentina shape" }, []),
          createElementNode("p", {}, [createTextNode("On paper, Argentina can easily be described as a 4-3-3.")]),
        ]),
      };
    }
  };

  const file = {
    name: "argentina-shape.png",
    type: "image/png",
    size: 4,
    async arrayBuffer() {
      return Uint8Array.from([9, 10, 11, 12]).buffer;
    },
  };

  try {
    const result = await context.window.__cmsImagePasteTestHooks.buildClipboardPasteMarkdown(
      "<html>ignored by fake parser</html>",
      "plain fallback should not be used",
      [file]
    );

    assert.strictEqual(
      result.markdown,
      "\nThe 2026 World Cup is about to begin.\n\nLionel **Messi** and [Lautaro Martinez](https://example.com/lautaro) lead the squad.\n\n## Argentina Base Formation\n\n1. Keep the ball\n2. Press after loss\n\n![argentina shape](data:image/png;base64,CQoLDA==)\n\nOn paper, Argentina can easily be described as a 4-3-3.\n",
      "rich HTML paste should preserve headings, emphasis, links, ordered lists, and image placement"
    );
  } finally {
    context.DOMParser = originalDOMParser;
  }
}

function testRichTextHtmlPasteFallsThroughToDecap() {
  const richEditable = new FakeEditable();
  context.document.activeElement = richEditable;
  context.document.activeElement = richEditable;
  context.document.querySelectorAll = (selector) => {
    if (selector === ".CodeMirror") {
      return [];
    }
    if (selector === '[contenteditable="true"]') {
      return [richEditable];
    }
    if (selector === "textarea") {
      return [];
    }
    return [];
  };
  context.window.getSelection = () => ({
    anchorNode: richEditable,
    rangeCount: 0,
  });
  const pasteListener = listeners.find((listener) => listener.type === "paste");
  let prevented = false;
  pasteListener.listener({
    target: richEditable,
    clipboardData: {
      items: [],
      getData(type) {
        if (type === "text/html") {
          return "<p>Alpha <strong>Messi</strong></p>";
        }
        if (type === "text/plain") {
          return "Alpha Messi";
        }
        return "";
      },
    },
    composedPath() {
      return [richEditable];
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  });

  assert.strictEqual(prevented, false, "rich text HTML-only paste should fall through to Decap so Slate keeps its own state in sync");
}

async function testRichTextImagePasteUsesSlateBlocksAtCursor() {
  const richEditable = new FakeEditable();
  const fieldChangeCalls = [];
  const slateChangeCalls = [];
  const slateValue = [
    { type: "paragraph", children: [{ text: "intro middle outro" }] },
  ];

  richEditable.__reactFiber$line = {
    memoizedProps: {
      value: slateValue,
      onChange(value) {
        slateChangeCalls.push(value);
      },
    },
    return: {
      memoizedProps: {
        field: {
          get(key) {
            return key === "name" ? "body" : undefined;
          },
        },
        value: "intro middle outro",
        onChange(value) {
          fieldChangeCalls.push(value);
        },
      },
      return: null,
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleRichTextImageInsert(
    [{
      name: "rich-paste.png",
      type: "image/png",
      size: 4,
      async arrayBuffer() {
        return Uint8Array.from([21, 22, 23, 24]).buffer;
      },
    }],
    {
      sourceNode: richEditable,
      activeElement: richEditable,
      path: [richEditable],
      slateBlock: slateValue[0],
      slateBlockOffset: "intro ".length,
    }
  );

  assert.strictEqual(fieldChangeCalls.length, 0, "rich text image paste should not fall back to markdown field updates");
  assert.strictEqual(slateChangeCalls.length, 1, "rich text image paste should update the Slate editor value directly");
  assert.strictEqual(slateChangeCalls[0].length, 3, "rich text image paste should split the paragraph into before/image/after blocks");
  assert.strictEqual(slateChangeCalls[0][0].type, "paragraph");
  assert.strictEqual(slateChangeCalls[0][0].children[0].text, "intro ");
  assert.strictEqual(slateChangeCalls[0][1].type, "image");
  assert.strictEqual(slateChangeCalls[0][1].data.url, "data:image/png;base64,FRYXGA==");
  assert.strictEqual(slateChangeCalls[0][1].data.alt, "rich paste");
  assert.strictEqual(slateChangeCalls[0][2].type, "paragraph");
  assert.strictEqual(slateChangeCalls[0][2].children[0].text, "middle outro");
}

async function testRichTextImagePasteUsesRememberedSlateContext() {
  const richEditable = new FakeEditable();
  const slateChangeCalls = [];
  const slateValue = [
    { type: "paragraph", children: [{ text: "intro middle outro" }] },
  ];

  richEditable.__reactFiber$line = {
    memoizedProps: {
      value: slateValue,
      onChange(value) {
        slateChangeCalls.push(value);
      },
    },
    return: {
      memoizedProps: {
        field: {
          get(key) {
            return key === "name" ? "body" : undefined;
          },
        },
        value: "intro middle outro",
        onChange() {},
      },
      return: null,
    },
  };

  context.window.__cmsImagePasteTestHooks.__setLastEditorSourceContext({
    sourceNode: richEditable,
    activeElement: richEditable,
    path: [richEditable],
    slateBlock: slateValue[0],
    slateBlockOffset: "intro ".length,
    slateBlockText: "intro middle outro",
    slateBlockIndex: 0,
  });

  await context.window.__cmsImagePasteTestHooks.handleRichTextImageInsert(
    [{
      name: "cursor-image.png",
      type: "image/png",
      size: 4,
      async arrayBuffer() {
        return Uint8Array.from([31, 32, 33, 34]).buffer;
      },
    }],
    {
      sourceNode: richEditable,
      activeElement: richEditable,
      path: [richEditable],
    }
  );

  assert.strictEqual(slateChangeCalls.length, 1);
  assert.strictEqual(
    slateChangeCalls[0][1].data.url,
    "data:image/png;base64,HyAhIg==",
    "rich text image paste should use the remembered Slate selection when the current event no longer exposes a block"
  );
}

async function testRichTextImagePasteUsesGlobalSelectionOffsetWhenBlockIsMissing() {
  const richEditable = new FakeEditable();
  const slateChangeCalls = [];
  const slateValue = [
    { type: "paragraph", children: [{ text: "intro middle outro" }] },
  ];

  richEditable.__reactFiber$line = {
    memoizedProps: {
      value: slateValue,
      onChange(value) {
        slateChangeCalls.push(value);
      },
    },
    return: {
      memoizedProps: {
        field: {
          get(key) {
            return key === "name" ? "body" : undefined;
          },
        },
        value: "intro middle outro",
        onChange() {},
      },
      return: null,
    },
  };

  await context.window.__cmsImagePasteTestHooks.handleRichTextImageInsert(
    [{
      name: "global-offset-image.png",
      type: "image/png",
      size: 4,
      async arrayBuffer() {
        return Uint8Array.from([41, 42, 43, 44]).buffer;
      },
    }],
    {
      sourceNode: richEditable,
      activeElement: richEditable,
      path: [richEditable],
      selectionOffset: "intro ".length,
    }
  );

  assert.strictEqual(slateChangeCalls.length, 1, "rich text image paste should derive the active block from the global selection offset");
  assert.strictEqual(slateChangeCalls[0][0].children[0].text, "intro ");
  assert.strictEqual(slateChangeCalls[0][1].data.url, "data:image/png;base64,KSorLA==");
  assert.strictEqual(slateChangeCalls[0][2].children[0].text, "middle outro");
}

function testSelectionChangeRemembersRichTextCursor() {
  const selectionListener = listeners.find((listener) => listener.type === "selectionchange");
  assert.ok(selectionListener, "selectionchange listener should be registered");

  const richEditable = new FakeEditable();
  const anchorNode = {
    nodeType: 3,
    parentElement: richEditable,
  };

  const originalGetSelection = context.window.getSelection;
  context.window.getSelection = () => ({
    anchorNode,
    rangeCount: 0,
  });

  try {
    selectionListener.listener();
    const remembered = context.window.__cmsImagePasteTestHooks.resolvePreferredInsertSourceContext(
      { sourceNode: richEditable, activeElement: richEditable, path: [richEditable], selectionOffset: 0 },
      null
    );
    assert.strictEqual(remembered.selectionOffset, 0);
  } finally {
    context.window.getSelection = originalGetSelection;
  }
}

function testResolveMarkdownInsertOffsetUsesSlateBlockText() {
  const offset = context.window.__cmsImagePasteTestHooks.resolveMarkdownInsertOffset(
    "\nIntro paragraph.\n\nArgentina 2026 Base Shape\n\nTail paragraph.\n",
    {
      selectionOffset: 0,
      slateBlockText: "Argentina 2026 Base Shape",
      slateBlockOffset: "Argentina ".length,
    }
  );

  assert.strictEqual(
    offset,
    "\nIntro paragraph.\n\n".length + "Argentina ".length,
    "rich text image insertion should anchor to the active Slate block text instead of falling back to offset 0"
  );
}

testUploadsImagesThroughR2Worker()
  .then(testFallsBackToInlineImageWhenUploadFails)
  .then(testUpdatesSlateRawMarkdownEditor)
  .then(testPreservesExistingSlateImageRows)
  .then(testHandlesMixedHtmlPasteWithImagesWithoutCrashingDecap)
  .then(testPreservesFormattingFromRichHtmlPaste)
  .then(testSelectionChangeRemembersRichTextCursor)
  .then(testResolveMarkdownInsertOffsetUsesSlateBlockText)
  .then(() => {
    console.log("cms-image-paste tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
