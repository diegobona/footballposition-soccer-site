const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const customJsPath = path.join(repoRoot, "static", "admin", "custom.js");
const source = fs.readFileSync(customJsPath, "utf8");

const instrumentedSource = source.replace(
  /\}\)\(\);\s*$/,
  "window.__cmsImagePasteTestHooks = { handleImageInsert, insertWithTextarea, setNativeValue, uploadImage, buildImageInsertSourceContext };})();"
);

const listeners = [];

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
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

testUploadsImagesThroughR2Worker()
  .then(testFallsBackToInlineImageWhenUploadFails)
  .then(testUpdatesSlateRawMarkdownEditor)
  .then(testPreservesExistingSlateImageRows)
  .then(() => {
    console.log("cms-image-paste tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
