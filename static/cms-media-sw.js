self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function getConfig() {
  var params = new URL(self.location.href).searchParams;
  return {
    owner: params.get("owner") || "",
    repo: params.get("repo") || "",
    branch: params.get("branch") || "main",
    mediaFolder: (params.get("mediaFolder") || "static/images/uploads").replace(/^\/+|\/+$/g, ""),
    publicFolder: "/" + (params.get("publicFolder") || "/images/uploads").replace(/^\/+|\/+$/g, "")
  };
}

function encodePath(path) {
  return path
    .split("/")
    .map(function (segment) {
      return encodeURIComponent(segment);
    })
    .join("/");
}

function buildRawMediaUrl(config, requestUrl) {
  var suffix = requestUrl.pathname.slice(config.publicFolder.length).replace(/^\/+/, "");
  var repoPath = config.mediaFolder + "/" + suffix;
  return (
    "https://raw.githubusercontent.com/" +
    encodeURIComponent(config.owner) +
    "/" +
    encodeURIComponent(config.repo) +
    "/" +
    encodeURIComponent(config.branch) +
    "/" +
    encodePath(repoPath)
  );
}

function fetchRawMedia(config, requestUrl) {
  return fetch(buildRawMediaUrl(config, requestUrl), { cache: "no-store" })
    .then(function (response) {
      return response.ok ? response : null;
    })
    .catch(function () {
      return null;
    });
}

self.addEventListener("fetch", function (event) {
  var requestUrl = new URL(event.request.url);
  var config = getConfig();

  if (
    event.request.method !== "GET" ||
    !config.owner ||
    !config.repo ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.indexOf(config.publicFolder + "/") !== 0
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetchRawMedia(config, requestUrl).then(function (remoteResponse) {
        return remoteResponse || fetch(event.request);
      });
    })
  );
});
