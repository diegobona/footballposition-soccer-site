const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function loadWorker() {
  const workerPath = path.resolve(__dirname, "..", "cloudflare", "cms-upload-worker.mjs");
  return import(pathToFileURL(workerPath).href + "?t=" + Date.now());
}

async function testUploadWritesImageToR2() {
  const { default: worker } = await loadWorker();
  const putCalls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.strictEqual(url, "https://api.github.com/repos/diegobona/footballposition-soccer-site");
    assert.strictEqual(options.headers.Authorization, "Bearer github-token");
    return { ok: true };
  };

  try {
    const formData = new FormData();
    formData.append("key", "uploads/2026/05/test.png");
    formData.append("file", new File([Uint8Array.from([1, 2, 3, 4])], "test.png", { type: "image/png" }));

    const response = await worker.fetch(
      new Request("https://cms-upload.footballposition.soccer/upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:1313",
          Authorization: "Bearer github-token",
        },
        body: formData,
      }),
      {
        MEDIA_BUCKET: {
          async put(key, value, options) {
            putCalls.push({ key, value, options });
          },
        },
        MEDIA_PUBLIC_BASE_URL: "https://media.footballposition.soccer",
        GITHUB_REPO: "diegobona/footballposition-soccer-site",
        ALLOWED_ORIGIN: "http://localhost:1313",
      }
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:1313");
    assert.strictEqual(putCalls.length, 1);
    assert.strictEqual(putCalls[0].key, "uploads/2026/05/test.png");
    assert.strictEqual(putCalls[0].options.httpMetadata.contentType, "image/png");

    const body = await response.json();
    assert.deepStrictEqual(body, {
      key: "uploads/2026/05/test.png",
      url: "https://media.footballposition.soccer/uploads/2026/05/test.png",
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testRejectsMissingAuthorization() {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    new Request("https://cms-upload.footballposition.soccer/upload", {
      method: "POST",
      headers: { Origin: "http://localhost:1313" },
      body: new FormData(),
    }),
    {
      MEDIA_BUCKET: { async put() {} },
      MEDIA_PUBLIC_BASE_URL: "https://media.footballposition.soccer",
      ALLOWED_ORIGIN: "http://localhost:1313",
    }
  );

  assert.strictEqual(response.status, 401);
}

async function testOptionsPreflight() {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    new Request("https://cms-upload.footballposition.soccer/upload", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:1313" },
    }),
    { ALLOWED_ORIGIN: "http://localhost:1313" }
  );

  assert.strictEqual(response.status, 204);
  assert.strictEqual(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
}

testUploadWritesImageToR2()
  .then(testRejectsMissingAuthorization)
  .then(testOptionsPreflight)
  .then(() => {
    console.log("cms-r2-worker tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
