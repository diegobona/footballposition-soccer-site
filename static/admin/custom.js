(function () {
  "use strict";

  var enhancerConfig = window.CMS_ENHANCER_CONFIG || {};
  var repoOwner = enhancerConfig.repoOwner || "";
  var repoName = enhancerConfig.repoName || "";
  var branch = enhancerConfig.branch || "main";
  var mediaFolder = enhancerConfig.mediaFolder || "static/images/uploads";
  var publicFolder = enhancerConfig.publicFolder || "/images/uploads";
  var githubApiRoot = enhancerConfig.githubApiRoot || "https://api.github.com";
  var mediaUploadEndpoint = enhancerConfig.mediaUploadEndpoint || "";
  var mediaPublicBaseUrl = enhancerConfig.mediaPublicBaseUrl || "";
  var mediaObjectFolder = enhancerConfig.mediaObjectFolder || "uploads";
  var maxFileSize = enhancerConfig.maxFileSize || 10 * 1024 * 1024;
  var toastTimer = null;
  var lastEditorSourceContext = null;

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeVideoUrl(value) {
    var url = String(value || "").trim();
    if (!url) {
      return "";
    }

    if (/^\/\//.test(url)) {
      return "https:" + url;
    }

    if (/^https?:\/\//i.test(url) || /^\/[^/]/.test(url)) {
      return url;
    }

    return "https://" + url;
  }

  function getYoutubeVideoId(url) {
    var match = String(url || "").match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return match ? match[1] : "";
  }

  function getVimeoVideoId(url) {
    var match = String(url || "").match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
    return match ? match[1] : "";
  }

  function getBilibiliVideoId(url) {
    var match = String(url || "").match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i);
    return match ? match[1] : "";
  }

  function isDirectVideoUrl(url) {
    return /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || ""));
  }

  function buildVideoEmbedHtml(url, title) {
    var normalizedUrl = normalizeVideoUrl(url);
    if (!normalizedUrl) {
      return "";
    }

    var safeTitle = escapeHtmlAttribute(String(title || "").trim() || "Embedded video");
    var safeUrl = escapeHtmlAttribute(normalizedUrl);
    var youtubeId = getYoutubeVideoId(normalizedUrl);
    var vimeoId = getVimeoVideoId(normalizedUrl);
    var bilibiliId = getBilibiliVideoId(normalizedUrl);
    var embedUrl = normalizedUrl;

    if (youtubeId) {
      embedUrl = "https://www.youtube-nocookie.com/embed/" + youtubeId;
    } else if (vimeoId) {
      embedUrl = "https://player.vimeo.com/video/" + vimeoId;
    } else if (bilibiliId) {
      embedUrl = "https://player.bilibili.com/player.html?bvid=" + bilibiliId;
    }

    if (isDirectVideoUrl(normalizedUrl)) {
      return '\n<figure class="video-embed">\n  <video controls preload="metadata" src="' + safeUrl + '" title="' + safeTitle + '"></video>\n</figure>\n';
    }

    return '\n<figure class="video-embed">\n  <iframe src="' + escapeHtmlAttribute(embedUrl) + '" title="' + safeTitle + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>\n</figure>\n';
  }

  function showToast(message, type) {
    var toast = document.getElementById("cms-upload-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cms-upload-toast";
      toast.style.position = "fixed";
      toast.style.right = "20px";
      toast.style.bottom = "20px";
      toast.style.zIndex = "99999";
      toast.style.maxWidth = "420px";
      toast.style.padding = "12px 16px";
      toast.style.borderRadius = "10px";
      toast.style.boxShadow = "0 12px 32px rgba(0, 0, 0, 0.16)";
      toast.style.font = "14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      toast.style.whiteSpace = "pre-wrap";
      document.body.appendChild(toast);
    }

    toast.style.background = type === "error" ? "#b42318" : type === "success" ? "#067647" : "#1d2939";
    toast.style.color = "#ffffff";
    toast.innerHTML = escapeHtml(message);
    toast.hidden = false;

    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, type === "error" ? 5000 : 2500);
  }

  function markNodeNoTranslate(node) {
    if (!node || !node.setAttribute) {
      return;
    }

    node.setAttribute("translate", "no");
    if (node.classList) {
      node.classList.add("notranslate");
    }
  }

  function protectEditorDomFromTranslation(root) {
    var scope = root || document;
    markNodeNoTranslate(document.documentElement);
    markNodeNoTranslate(document.body);
    Array.prototype.forEach.call(
      scope.querySelectorAll('[data-slate-editor], [data-slate-node], [contenteditable="true"], textarea, .CodeMirror, #nc-root'),
      markNodeNoTranslate
    );
  }

  function startTranslationProtection() {
    protectEditorDomFromTranslation(document);

    if (typeof MutationObserver !== "function" || !document.body) {
      return;
    }

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        for (var index = 0; index < mutations[i].addedNodes.length; index += 1) {
          var node = mutations[i].addedNodes[index];
          if (node && node.nodeType === 1) {
            protectEditorDomFromTranslation(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function registerMediaFallbackServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    var params = new URLSearchParams({
      owner: repoOwner,
      repo: repoName,
      branch: branch,
      mediaFolder: mediaFolder,
      publicFolder: publicFolder
    });

    navigator.serviceWorker
      .register("/cms-media-sw.js?" + params.toString(), { scope: "/" })
      .then(function (registration) {
        registration.update();
        if (!navigator.serviceWorker.controller) {
          console.info("CMS media fallback service worker registered; reload once if local preview images still miss.");
        }
      })
      .catch(function (error) {
        console.warn("CMS media fallback service worker registration failed", error);
      });
  }

  async function cacheImageForLocalPreview(publicUrl, file) {
    if (!publicUrl || !file || typeof caches === "undefined" || typeof Response === "undefined" || typeof Request === "undefined") {
      return;
    }

    try {
      var cache = await caches.open("cms-pasted-media-v1");
      var request = new Request(new URL(publicUrl, window.location.origin).toString(), { method: "GET" });
      var response = new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "Cache-Control": "no-store"
        }
      });
      await cache.put(request, response);
    } catch (error) {
      console.warn("CMS image paste warning: unable to cache pasted image for local preview", error);
    }
  }

  function readStoredUser(storage, key) {
    try {
      var raw = storage.getItem(key);
      if (!raw) {
        return null;
      }
      var data = JSON.parse(raw);
      if (data && typeof data.token === "string" && data.token) {
        return data;
      }
    } catch (error) {
      console.warn("Unable to parse CMS auth payload from", key, error);
    }
    return null;
  }

  function findGithubToken() {
    var storageList = [window.localStorage, window.sessionStorage];
    var keyList = ["netlify-cms-user", "decap-cms-user"];
    var index;

    for (index = 0; index < storageList.length; index += 1) {
      var storage = storageList[index];
      if (!storage) {
        continue;
      }

      for (var keyIndex = 0; keyIndex < keyList.length; keyIndex += 1) {
        var user = readStoredUser(storage, keyList[keyIndex]);
        if (user && user.token) {
          return user.token;
        }
      }

      try {
        for (var i = 0; i < storage.length; i += 1) {
          var dynamicKey = storage.key(i);
          if (!dynamicKey) {
            continue;
          }
          var dynamicUser = readStoredUser(storage, dynamicKey);
          if (
            dynamicUser &&
            typeof dynamicUser.token === "string" &&
            dynamicUser.token &&
            (!dynamicUser.backend || dynamicUser.backend === "github")
          ) {
            return dynamicUser.token;
          }
        }
      } catch (error) {
        console.warn("Unable to scan browser storage for CMS token", error);
      }
    }

    return null;
  }

  function getFileExtension(file) {
    if (file && file.name && file.name.indexOf(".") !== -1) {
      return file.name.split(".").pop().toLowerCase();
    }

    if (!file || !file.type) {
      return "png";
    }

    if (file.type === "image/jpeg") {
      return "jpg";
    }

    if (file.type === "image/svg+xml") {
      return "svg";
    }

    var parts = file.type.split("/");
    return parts[1] || "png";
  }

  function getAltText(file) {
    var name = (file && file.name) || "image";
    var baseName = name.replace(/\.[^.]+$/, "");
    var alt = slugify(baseName).replace(/-/g, " ").trim();
    return alt || "image";
  }

  function normalizeAltText(value, fallback) {
    var alt = slugify(String(value || "")).replace(/-/g, " ").trim();
    if (alt) {
      return alt;
    }

    return fallback || "image";
  }

  function buildMarkdownWithAlt(alt, publicUrl) {
    return "\n![" + normalizeAltText(alt, "image") + "](" + publicUrl + ")\n";
  }

  function buildMarkdown(file, publicUrl) {
    return buildMarkdownWithAlt(getAltText(file), publicUrl);
  }

  async function buildInlineMarkdown(file) {
    var buffer = await file.arrayBuffer();
    var mimeType = file.type || "image/png";
    var dataUrl = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);
    return buildMarkdown(file, dataUrl);
  }

  function sanitizeFileName(name) {
    return (
      String(name || "image")
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "image"
    );
  }

  function buildFilePath(file) {
    var now = new Date();
    var year = String(now.getUTCFullYear());
    var month = String(now.getUTCMonth() + 1).padStart(2, "0");
    var day = String(now.getUTCDate()).padStart(2, "0");
    var time = [
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0")
    ].join("");
    var suffix = Math.random().toString(16).slice(2, 10);
    var extension = getFileExtension(file);
    var fileName = year + month + day + "-" + time + "-" + suffix + "-" + sanitizeFileName(file.name) + "." + extension;

    return {
      repoPath: mediaFolder + "/" + year + "/" + month + "/" + fileName,
      publicUrl: publicFolder + "/" + year + "/" + month + "/" + fileName,
      objectKey: mediaObjectFolder.replace(/^\/+|\/+$/g, "") + "/" + year + "/" + month + "/" + fileName
    };
  }

  function encodeRepoPath(path) {
    return path
      .split("/")
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join("/");
  }

  function arrayBufferToBase64(buffer) {
    var binary = "";
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;

    for (var index = 0; index < bytes.length; index += chunkSize) {
      var chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return window.btoa(binary);
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }

    var style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().height > 0;
  }

  function dispatchChangeEvents(target) {
    if (!target) {
      return;
    }

    try {
      target.dispatchEvent(new InputEvent("input", { bubbles: true, data: null, inputType: "insertText" }));
    } catch (error) {
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    target.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      target.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    } catch (error) {
      target.dispatchEvent(new Event("blur", { bubbles: true }));
    }
  }

  function findBodyFieldRoot() {
    var labelNode = Array.prototype.find.call(document.querySelectorAll("label, div, span"), function (node) {
      var text = (node.textContent || "").trim();
      return /^文章正文\b|^Body\b/i.test(text);
    });

    if (!labelNode || !labelNode.closest) {
      return null;
    }

    return labelNode.closest('[data-testid], [class*="EditorControl"], [class*="Widget"], section, article, div');
  }

  function closestEditorCandidate(node) {
    if (!node || !node.closest) {
      return null;
    }

    return (
      node.closest(".CodeMirror") ||
      node.closest('[contenteditable="true"]') ||
      node.closest("textarea") ||
      null
    );
  }

  function getEventPathCandidates(sourceEvent) {
    if (!sourceEvent || typeof sourceEvent.composedPath !== "function") {
      return [];
    }

    return sourceEvent.composedPath().filter(function (node) {
      return node && node.nodeType === 1;
    });
  }

  function claimImageEvent(event) {
    event.preventDefault();
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function buildEditorCandidates(sourceContext) {
    var candidates = [];
    var activeElement = sourceContext && sourceContext.activeElement ? sourceContext.activeElement : document.activeElement;
    var sourceNode = sourceContext && sourceContext.sourceNode ? sourceContext.sourceNode : null;
    var eventPath = sourceContext && sourceContext.path ? sourceContext.path : [];
    var bodyFieldRoot = findBodyFieldRoot();

    function pushIfExists(value) {
      if (value && candidates.indexOf(value) === -1) {
        candidates.push(value);
      }
    }

    pushIfExists(closestEditorCandidate(sourceNode));
    pushIfExists(closestEditorCandidate(activeElement));

    for (var pathIndex = 0; pathIndex < eventPath.length; pathIndex += 1) {
      pushIfExists(closestEditorCandidate(eventPath[pathIndex]));
    }

    if (sourceNode && sourceNode.querySelector) {
      pushIfExists(sourceNode.querySelector(".CodeMirror"));
      pushIfExists(sourceNode.querySelector('[contenteditable="true"]'));
      pushIfExists(sourceNode.querySelector("textarea"));
    }

    if (bodyFieldRoot && bodyFieldRoot.querySelector) {
      pushIfExists(bodyFieldRoot.querySelector(".CodeMirror"));
      pushIfExists(bodyFieldRoot.querySelector('[contenteditable="true"]'));
      pushIfExists(bodyFieldRoot.querySelector("textarea"));
    }

    pushIfExists(Array.prototype.find.call(document.querySelectorAll(".CodeMirror"), function (node) {
      return isVisibleElement(node);
    }));

    return candidates.filter(Boolean);
  }

  function findAssociatedTextareas(wrapper) {
    var candidates = [];

    function pushIfExists(value) {
      if (value && candidates.indexOf(value) === -1) {
        candidates.push(value);
      }
    }

    if (!wrapper) {
      return candidates;
    }

    Array.prototype.forEach.call(wrapper.querySelectorAll("textarea"), pushIfExists);

    if (wrapper.nextElementSibling && wrapper.nextElementSibling.tagName === "TEXTAREA") {
      pushIfExists(wrapper.nextElementSibling);
    }

    var fieldRoot = wrapper.closest('[data-testid], [class*="EditorControl"], [class*="Widget"], section, article, div');
    if (fieldRoot) {
      Array.prototype.forEach.call(fieldRoot.querySelectorAll("textarea"), pushIfExists);
    }

    return candidates;
  }

  function setNativeValue(element, value) {
    if (!element) {
      return;
    }

    var prototype = Object.getPrototypeOf(element);
    var descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function getReactFiber(node) {
    if (!node) {
      return null;
    }

    var keys = Object.getOwnPropertyNames(node);
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
        return node[keys[i]];
      }
      if (keys[i].indexOf("__reactProps$") === 0) {
        return { memoizedProps: node[keys[i]], return: null };
      }
    }

    return null;
  }

  function getFieldName(field) {
    if (!field) {
      return "";
    }

    if (typeof field.get === "function") {
      return field.get("name") || "";
    }

    return field.name || "";
  }

  function getFiberProps(fiber) {
    if (!fiber) {
      return null;
    }

    return fiber.memoizedProps || fiber.pendingProps || (fiber.stateNode && fiber.stateNode.props) || null;
  }

  function findCmsFieldController(sourceContext) {
    var nodes = [];

    function pushNode(node) {
      if (node && nodes.indexOf(node) === -1) {
        nodes.push(node);
      }
    }

    if (sourceContext) {
      pushNode(sourceContext.sourceNode);
      pushNode(sourceContext.activeElement);
      if (sourceContext.path) {
        for (var pathIndex = 0; pathIndex < sourceContext.path.length; pathIndex += 1) {
          pushNode(sourceContext.path[pathIndex]);
        }
      }
    }

    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      var node = nodes[nodeIndex];
      var nodeDepth = 0;

      while (node && nodeDepth < 20) {
        var fiber = getReactFiber(node);
        var fiberDepth = 0;

        while (fiber && fiberDepth < 100) {
          var props = getFiberProps(fiber);
          if (props && typeof props.onChange === "function" && getFieldName(props.field) === "body") {
            return {
              onChange: props.onChange,
              value: typeof props.value === "string" ? props.value : ""
            };
          }

          fiber = fiber.return;
          fiberDepth += 1;
        }

        node = node.parentElement;
        nodeDepth += 1;
      }
    }

    return null;
  }

  function insertViaCmsFieldChange(text, sourceContext) {
    var controller = findCmsFieldController(sourceContext);
    if (!controller) {
      return false;
    }

    var currentValue = controller.value || "";
    var offset = sourceContext && typeof sourceContext.selectionOffset === "number" ? sourceContext.selectionOffset : null;
    controller.onChange(insertTextAtOffset(currentValue, text, offset));
    return true;
  }

  function isSlateRawTextNode(node) {
    return node && typeof node.text === "string";
  }

  function isSlateRawBlock(node) {
    return (
      node &&
      node.type === "paragraph" &&
      Array.isArray(node.children) &&
      node.children.length >= 1 &&
      node.children.every(isSlateRawTextNode)
    );
  }

  function isSlateRawValue(value) {
    return Array.isArray(value) && value.length >= 1 && value.every(isSlateRawBlock);
  }

  function isSlateValue(value) {
    return Array.isArray(value) && value.length >= 1 && value.every(function (node) {
      return node && typeof node.type === "string" && Array.isArray(node.children);
    });
  }

  function slateRawValueToText(value) {
    return value
      .map(function (node) {
        return node.children
          .map(function (child) {
            return child.text || "";
          })
          .join("");
      })
      .join("\n");
  }

  function textToSlateRawValue(value) {
    return String(value || "")
      .split("\n")
      .map(createSlateRawBlock);
  }

  function createSlateRawBlock(line) {
    return {
      type: "paragraph",
      children: [{ text: String(line || "") }]
    };
  }

  function markdownTextToSlateRawBlocks(text) {
    return String(text || "")
      .replace(/^\n+/g, "")
      .split("\n")
      .map(createSlateRawBlock);
  }

  function markdownToSlateBlocks(text) {
    var lines = String(text || "").replace(/^\n+/g, "").split("\n");
    var blocks = [];
    var imageRegex = /^!\[([^\]]*)\]\(([^)]+)\)$/;

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      var match = imageRegex.exec(line);
      if (match) {
        blocks.push({
          type: "image",
          data: {
            url: match[2],
            alt: match[1] || ""
          },
          children: [{ text: "" }],
          isVoid: true
        });
      } else if (line) {
        blocks.push(createSlateRawBlock(line));
      }
    }

    return blocks.length ? blocks : [createSlateRawBlock("")];
  }

  function insertTextAtOffset(value, text, offset) {
    var currentValue = String(value || "");
    if (typeof offset !== "number" || !isFinite(offset) || offset < 0 || offset > currentValue.length) {
      var separator = currentValue && !/\n$/.test(currentValue) && !/^\n/.test(text) ? "\n" : "";
      return currentValue + separator + text;
    }

    var before = currentValue.slice(0, offset);
    var after = currentValue.slice(offset);
    var prefix = before && !/\n$/.test(before) && !/^\n/.test(text) ? "\n" : "";
    var suffix = after && !/\n$/.test(text) && !/^\n/.test(after) ? "\n" : "";
    return before + prefix + text + suffix + after;
  }

  function findNearestEditableRoot(node) {
    var current = node && node.nodeType === 3 ? node.parentElement : node;

    while (current && current !== document.body) {
      if (current.isContentEditable || current.getAttribute("contenteditable") === "true") {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function findNearestSlateElementNode(node) {
    var current = node && node.nodeType === 3 ? node.parentElement : node;

    while (current && current !== document.body) {
      if (current.getAttribute && current.getAttribute("data-slate-node") === "element") {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function findSlateBlockFromDomNode(node) {
    var current = findNearestSlateElementNode(node) || (node && node.nodeType === 3 ? node.parentElement : node);
    var depth = 0;

    while (current && depth < 20) {
      var fiber = getReactFiber(current);
      var fiberDepth = 0;

      while (fiber && fiberDepth < 30) {
        var props = getFiberProps(fiber);
        if (props && isSlateRawBlock(props.element)) {
          return props.element;
        }

        fiber = fiber.return;
        fiberDepth += 1;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function getSelectionOffsetWithinNode(node) {
    var selection = window.getSelection && window.getSelection();
    var elementNode = findNearestSlateElementNode(node);

    if (!selection || selection.rangeCount === 0 || !elementNode || !elementNode.contains(selection.anchorNode)) {
      return null;
    }

    try {
      var range = selection.getRangeAt(0).cloneRange();
      var preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(elementNode);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      return preSelectionRange.toString().length;
    } catch (error) {
      console.warn("CMS image paste warning: unable to capture Slate line cursor offset", error);
      return null;
    }
  }

  function getSlateSelectionContext(sourceNode) {
    return {
      slateBlock: findSlateBlockFromDomNode(sourceNode),
      slateBlockOffset: getSelectionOffsetWithinNode(sourceNode)
    };
  }

  function getSelectionAnchorNode() {
    var selection = window.getSelection && window.getSelection();
    return selection && selection.anchorNode ? selection.anchorNode : null;
  }

  function buildImageInsertSourceContext(event) {
    var selectionNode = getSelectionAnchorNode() || event.target;
    var slateSelectionContext = getSlateSelectionContext(selectionNode);
    var slateBlockOffset = slateSelectionContext.slateBlockOffset;
    var globalOffset = null;
    var slateBlockText = null;
    var slateBlockIndex = null;

    if (slateSelectionContext.slateBlock && typeof slateBlockOffset === "number" && isFinite(slateBlockOffset)) {
      var controller = findSlateRawController({
        sourceNode: event.target,
        activeElement: document.activeElement,
        path: getEventPathCandidates(event)
      });
      if (controller && isSlateValue(controller.value)) {
        globalOffset = getOffsetForSlateBlock(controller.value, slateSelectionContext.slateBlock, slateBlockOffset);
        var blockIndex = controller.value.indexOf(slateSelectionContext.slateBlock);
        if (blockIndex !== -1) {
          slateBlockText = getSlateBlockText(slateSelectionContext.slateBlock);
          slateBlockIndex = blockIndex;
        }
      }
    }

    if (globalOffset === null) {
      globalOffset = getSelectionCharacterOffset(selectionNode);
    }

    return {
      sourceNode: event.target,
      activeElement: document.activeElement,
      path: getEventPathCandidates(event),
      selectionOffset: globalOffset,
      slateBlock: slateSelectionContext.slateBlock,
      slateBlockOffset: slateSelectionContext.slateBlockOffset,
      slateBlockText: slateBlockText,
      slateBlockIndex: slateBlockIndex
    };
  }

  function getSelectionCharacterOffset(sourceNode) {
    var selection = window.getSelection && window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    var editableRoot = findNearestEditableRoot(selection.anchorNode) || findNearestEditableRoot(sourceNode);
    if (!editableRoot || !editableRoot.contains(selection.anchorNode)) {
      return null;
    }

    try {
      var range = selection.getRangeAt(0).cloneRange();
      var preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(editableRoot);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      return preSelectionRange.toString().length;
    } catch (error) {
      console.warn("CMS image paste warning: unable to capture editor cursor offset", error);
      return null;
    }
  }

  function getSlateBlockText(block) {
    if (!isSlateRawBlock(block)) {
      return "";
    }

    return block.children
      .map(function (child) {
        return child.text || "";
      })
      .join("");
  }

  function getOffsetForSlateBlock(value, block, blockOffset) {
    if (!block || !isSlateRawValue(value)) {
      return null;
    }

    var offset = 0;
    for (var i = 0; i < value.length; i += 1) {
      if (value[i] === block) {
        var textLength = getSlateBlockText(value[i]).length;
        var safeBlockOffset = typeof blockOffset === "number" && isFinite(blockOffset)
          ? Math.max(0, Math.min(blockOffset, textLength))
          : textLength;
        return offset + safeBlockOffset;
      }

      offset += getSlateBlockText(value[i]).length;
      if (i < value.length - 1) {
        offset += 1;
      }
    }

    return null;
  }

  function findBlockIndexByContent(value, blockText, hintIndex) {
    if (!isSlateRawValue(value) || typeof blockText !== "string") {
      return -1;
    }

    if (typeof hintIndex === "number" && hintIndex >= 0 && hintIndex < value.length) {
      if (getSlateBlockText(value[hintIndex]) === blockText) {
        return hintIndex;
      }
    }

    for (var i = 0; i < value.length; i += 1) {
      if (getSlateBlockText(value[i]) === blockText) {
        return i;
      }
    }

    return -1;
  }

  function resolveSlateBlock(currentValue, sourceContext) {
    if (!sourceContext || !sourceContext.slateBlock) {
      return null;
    }

    if (currentValue.indexOf(sourceContext.slateBlock) !== -1) {
      return sourceContext.slateBlock;
    }

    if (sourceContext.slateBlockText != null) {
      var index = findBlockIndexByContent(currentValue, sourceContext.slateBlockText, sourceContext.slateBlockIndex);
      if (index !== -1) {
        return currentValue[index];
      }
    }

    return null;
  }

  function insertBlocksAtBlockIndex(value, text, blockIndex) {
    if (!Array.isArray(value) || typeof blockIndex !== "number" || blockIndex < 0 || blockIndex >= value.length) {
      var newBlocks = markdownToSlateBlocks(text);
      return value.concat(newBlocks);
    }

    var newBlocks = markdownToSlateBlocks(text);
    var nextValue = value.slice(0, blockIndex + 1);
    Array.prototype.push.apply(nextValue, newBlocks);
    Array.prototype.push.apply(nextValue, value.slice(blockIndex + 1));
    return nextValue;
  }

  function insertTextIntoSlateRawValue(value, text, block, blockOffset, fallbackOffset) {
    if (!isSlateRawValue(value) || !block) {
      return textToSlateRawValue(insertTextAtOffset(slateRawValueToText(value || []), text, typeof fallbackOffset === "number" ? fallbackOffset : null));
    }

    var blockIndex = value.indexOf(block);
    if (blockIndex === -1) {
      return textToSlateRawValue(insertTextAtOffset(slateRawValueToText(value), text, typeof fallbackOffset === "number" ? fallbackOffset : null));
    }

    var blockText = getSlateBlockText(block);
    var safeOffset = typeof blockOffset === "number" && isFinite(blockOffset)
      ? Math.max(0, Math.min(blockOffset, blockText.length))
      : blockText.length;
    var beforeText = blockText.slice(0, safeOffset);
    var afterText = blockText.slice(safeOffset);
    var insertedBlocks = markdownTextToSlateRawBlocks(text);
    var nextValue = value.slice(0, blockIndex);

    if (beforeText || safeOffset > 0) {
      if (beforeText === blockText) {
        nextValue.push(block);
      } else {
        nextValue.push(createSlateRawBlock(beforeText));
      }
    }

    Array.prototype.push.apply(nextValue, insertedBlocks);

    if (afterText || safeOffset < blockText.length) {
      if (afterText === blockText) {
        nextValue.push(block);
      } else {
        nextValue.push(createSlateRawBlock(afterText));
      }
    }

    Array.prototype.push.apply(nextValue, value.slice(blockIndex + 1));
    return nextValue.length ? nextValue : [createSlateRawBlock("")];
  }

  function findSlateRawController(sourceContext) {
    var nodes = [];

    function pushNode(node) {
      if (node && nodes.indexOf(node) === -1) {
        nodes.push(node);
      }
    }

    if (sourceContext) {
      pushNode(sourceContext.sourceNode);
      pushNode(sourceContext.activeElement);
      if (sourceContext.path) {
        for (var pathIndex = 0; pathIndex < sourceContext.path.length; pathIndex += 1) {
          pushNode(sourceContext.path[pathIndex]);
        }
      }
    }

    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      var node = nodes[nodeIndex];
      var nodeDepth = 0;

      while (node && nodeDepth < 20) {
        var fiber = getReactFiber(node);
        var fiberDepth = 0;

        while (fiber && fiberDepth < 100) {
          var props = getFiberProps(fiber);
          if (props && typeof props.onChange === "function" && isSlateValue(props.value)) {
            return {
              onChange: props.onChange,
              value: props.value
            };
          }

          fiber = fiber.return;
          fiberDepth += 1;
        }

        node = node.parentElement;
        nodeDepth += 1;
      }
    }

    return null;
  }

  function insertViaSlateRawEditor(text, sourceContext) {
    var controller = findSlateRawController(sourceContext);
    if (!controller) {
      return false;
    }

    var resolvedBlock = resolveSlateBlock(controller.value, sourceContext);
    var hasOnlyTextBlocks = isSlateRawValue(controller.value);

    if (resolvedBlock && hasOnlyTextBlocks) {
      controller.onChange(insertTextIntoSlateRawValue(
        controller.value,
        text,
        resolvedBlock,
        sourceContext.slateBlockOffset,
        sourceContext.selectionOffset
      ));
    } else if (typeof sourceContext.slateBlockIndex === "number" && sourceContext.slateBlockIndex >= 0) {
      controller.onChange(insertBlocksAtBlockIndex(
        controller.value,
        text,
        sourceContext.slateBlockIndex
      ));
    } else if (resolvedBlock) {
      var blockIndex = controller.value.indexOf(resolvedBlock);
      if (blockIndex !== -1) {
        controller.onChange(insertBlocksAtBlockIndex(controller.value, text, blockIndex));
      } else {
        var newBlocks = markdownToSlateBlocks(text);
        controller.onChange(controller.value.concat(newBlocks));
      }
    } else {
      var newBlocks = markdownToSlateBlocks(text);
      controller.onChange(controller.value.concat(newBlocks));
    }
    return true;
  }

  function notifyCmsFieldChange(sourceNode, value) {
    var node = sourceNode;
    var nodeDepth = 0;

    while (node && nodeDepth < 20) {
      var fiber = getReactFiber(node);
      var fiberDepth = 0;

      while (fiber && fiberDepth < 100) {
        var props = getFiberProps(fiber);
        if (props && typeof props.onChange === "function" && getFieldName(props.field) === "body") {
          props.onChange(value);
          return true;
        }

        fiber = fiber.return;
        fiberDepth += 1;
      }

      node = node.parentElement;
      nodeDepth += 1;
    }

    console.warn("CMS image paste debug: unable to notify Decap body field change");
    return false;
  }

  function buildRevisionValue() {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2, 8);
  }

  function updateRevisionField() {
    var selectors = [
      'input[name*="_editor_revision"]',
      'input[id*="_editor_revision"]',
      'input[type="hidden"][value]'
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var fields = document.querySelectorAll(selectors[i]);
      for (var index = 0; index < fields.length; index += 1) {
        var field = fields[index];
        var name = (field.getAttribute("name") || "") + " " + (field.getAttribute("id") || "");
        if (selectors[i] === 'input[type="hidden"][value]' && name.indexOf("_editor_revision") === -1) {
          continue;
        }

        setNativeValue(field, buildRevisionValue());
        dispatchChangeEvents(field);
        return true;
      }
    }

    console.debug("CMS image paste debug: revision field not found");
    return false;
  }

  function insertWithCodeMirror(host, text) {
    if (!host || !host.CodeMirror) {
      return false;
    }

    var codeMirror = host.CodeMirror;
    var wrapper = codeMirror.getWrapperElement();
    var textareas = findAssociatedTextareas(wrapper);

    codeMirror.focus();
    codeMirror.replaceSelection(text, "around");
    codeMirror.save();
    var value = codeMirror.getValue();
    notifyCmsFieldChange(wrapper, value);
    for (var i = 0; i < textareas.length; i += 1) {
      setNativeValue(textareas[i], value);
      dispatchChangeEvents(textareas[i]);
    }
    dispatchChangeEvents(wrapper);
    return true;
  }

  function insertWithTextarea(textarea, text) {
    if (!textarea) {
      return false;
    }

    var start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
    var end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : textarea.value.length;
    var nextValue = textarea.value.slice(0, start) + text + textarea.value.slice(end);

    textarea.focus();
    setNativeValue(textarea, nextValue);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    notifyCmsFieldChange(textarea, nextValue);
    dispatchChangeEvents(textarea);
    return true;
  }

  function insertWithContentEditable(editable, text) {
    if (!editable || !editable.isContentEditable) {
      return false;
    }

    editable.focus();
    try {
      document.execCommand("insertText", false, text);
    } catch (error) {
      var selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editable.appendChild(document.createTextNode(text));
      }
    }

    dispatchChangeEvents(editable);
    return true;
  }

  function insertMarkdownIntoCms(text, sourceContext) {
    var candidates = buildEditorCandidates(sourceContext);

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (candidate.classList && candidate.classList.contains("CodeMirror") && insertWithCodeMirror(candidate, text)) {
        return true;
      }

      if (candidate.tagName === "TEXTAREA" && insertWithTextarea(candidate, text)) {
        return true;
      }

      if (candidate.isContentEditable) {
        continue;
      }
    }

    if (insertViaSlateRawEditor(text, sourceContext)) {
      return true;
    }

    if (insertViaCmsFieldChange(text, sourceContext)) {
      return true;
    }

    console.warn("CMS image paste debug: unable to resolve editor target", {
      sourceNode: sourceContext && sourceContext.sourceNode,
      activeElement: sourceContext && sourceContext.activeElement,
      path: sourceContext && sourceContext.path,
      candidates: candidates
    });
    throw new Error("未找到正文编辑器，请先点击文章正文区域后再插入内容。");
  }

  function collectPastedImages(event) {
    var files = [];
    var items = (event.clipboardData && event.clipboardData.items) || [];

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (item && item.type && item.type.indexOf("image/") === 0) {
        var file = item.getAsFile();
        if (file) {
          if (!file.name) {
            file = new File([file], "pasted-image." + getFileExtension(file), { type: file.type });
          }
          files.push(file);
        }
      }
    }

    return files;
  }

  function collectDroppedImages(event) {
    var files = Array.prototype.slice.call((event.dataTransfer && event.dataTransfer.files) || []);
    return files.filter(function (file) {
      return file && file.type && file.type.indexOf("image/") === 0;
    });
  }

  async function uploadImage(file) {
    var token = findGithubToken();

    if (!token) {
      throw new Error("未读取到 CMS 登录 token，请先重新登录后台后再粘贴图片。");
    }

    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      throw new Error("只支持上传图片文件。");
    }

    if (file.size > maxFileSize) {
      throw new Error("图片过大，当前限制为 10MB。");
    }

    var pathInfo = buildFilePath(file);

    if (mediaUploadEndpoint) {
      var formData = new FormData();
      formData.append("file", file, file.name || "image." + getFileExtension(file));
      formData.append("key", pathInfo.objectKey);
      formData.append("publicBaseUrl", mediaPublicBaseUrl);

      var uploadResponse = await fetch(mediaUploadEndpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        var uploadErrorText = await uploadResponse.text();
        throw new Error(uploadErrorText || "图片上传到 R2 失败，请稍后重试。");
      }

      var uploadData = await uploadResponse.json();
      if (!uploadData || !uploadData.url) {
        throw new Error("R2 上传接口没有返回图片 URL。");
      }

      return {
        publicUrl: uploadData.url,
        repoPath: uploadData.key || pathInfo.objectKey
      };
    }

    if (!repoOwner || !repoName) {
      throw new Error("CMS 图片上传配置缺失，请检查仓库配置。");
    }

    var buffer = await file.arrayBuffer();
    var response = await fetch(githubApiRoot + "/repos/" + repoOwner + "/" + repoName + "/contents/" + encodeRepoPath(pathInfo.repoPath), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        message: "Upload image " + pathInfo.repoPath,
        branch: branch,
        content: arrayBufferToBase64(buffer)
      })
    });

    if (!response.ok) {
      var errorText = await response.text();
      throw new Error(errorText || "图片上传失败，请稍后重试。");
    }

    return {
      publicUrl: pathInfo.publicUrl,
      repoPath: pathInfo.repoPath
    };
  }

  async function uploadImageToMarkdown(file) {
    try {
      var result = await uploadImage(file);
      await cacheImageForLocalPreview(result.publicUrl, file);
      return {
        markdown: buildMarkdown(file, result.publicUrl),
        error: null
      };
    } catch (uploadError) {
      console.warn("CMS image paste warning: image upload failed, using inline image fallback", uploadError);
      return {
        markdown: await buildInlineMarkdown(file),
        error: uploadError
      };
    }
  }

  function getClipboardHtml(event) {
    if (!event || !event.clipboardData || typeof event.clipboardData.getData !== "function") {
      return "";
    }

    return event.clipboardData.getData("text/html") || "";
  }

  function containsHtmlImages(html) {
    return /<img\b/i.test(String(html || ""));
  }

  function getClipboardPlainText(event) {
    if (!event || !event.clipboardData || typeof event.clipboardData.getData !== "function") {
      return "";
    }

    return event.clipboardData.getData("text/plain") || "";
  }

  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&#(\d+);/g, function (match, code) {
        var parsed = parseInt(code, 10);
        return isFinite(parsed) ? String.fromCharCode(parsed) : match;
      })
      .replace(/&#x([0-9a-f]+);/gi, function (match, code) {
        var parsed = parseInt(code, 16);
        return isFinite(parsed) ? String.fromCharCode(parsed) : match;
      });
  }

  function extractHtmlAttribute(attributes, name) {
    var match = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', "i").exec(String(attributes || ""));
    if (!match) {
      return "";
    }

    return decodeHtmlEntities(match[2] || match[3] || match[4] || "");
  }

  function normalizeHtmlPasteText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function extractHtmlPastePayload(html) {
    var images = [];
    var blockBoundaryRegex = /<\/(?:p|div|section|article|blockquote|h[1-6]|tr|table|ul|ol)>/gi;
    var lineBreakRegex = /<(?:br\s*\/?|\/li)>/gi;
    var listItemRegex = /<li\b[^>]*>/gi;
    var text = String(html || "").replace(/<img\b([^>]*)>/gi, function (match, attributes) {
      var index = images.length;
      images.push({
        src: extractHtmlAttribute(attributes, "src"),
        alt: extractHtmlAttribute(attributes, "alt")
      });
      return "\n[[CMS_IMAGE_" + index + "]]\n";
    });

    text = text
      .replace(lineBreakRegex, "\n")
      .replace(blockBoundaryRegex, "\n\n")
      .replace(listItemRegex, "- ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "");

    return {
      text: normalizeHtmlPasteText(decodeHtmlEntities(text)),
      images: images
    };
  }

  function normalizePastedImageUrl(value) {
    var url = String(value || "").trim();
    if (!url) {
      return "";
    }

    if (/^\/\//.test(url)) {
      return "https:" + url;
    }

    if (/^(?:https?:|data:|\/)/i.test(url)) {
      return url;
    }

    return "";
  }

  async function buildClipboardPasteMarkdown(html, plainText, files) {
    var parsedHtml = extractHtmlPastePayload(html);
    var pendingFiles = Array.isArray(files) ? files.slice() : [];
    var uploadFailures = [];
    var output = parsedHtml.text || normalizeHtmlPasteText(plainText);

    for (var i = 0; i < parsedHtml.images.length; i += 1) {
      var image = parsedHtml.images[i];
      var markdown = "";
      var directUrl = normalizePastedImageUrl(image.src);

      if (directUrl) {
        markdown = buildMarkdownWithAlt(image.alt, directUrl).trim();
      } else if (pendingFiles.length) {
        var uploadResult = await uploadImageToMarkdown(pendingFiles.shift());
        markdown = uploadResult.markdown.trim();
        if (uploadResult.error) {
          uploadFailures.push(uploadResult.error);
        }
      }

      output = output.replace("[[CMS_IMAGE_" + i + "]]", markdown ? "\n\n" + markdown + "\n\n" : "");
    }

    while (pendingFiles.length) {
      var remainingUpload = await uploadImageToMarkdown(pendingFiles.shift());
      if (remainingUpload.error) {
        uploadFailures.push(remainingUpload.error);
      }
      output = output
        ? output + "\n\n" + remainingUpload.markdown.trim()
        : remainingUpload.markdown.trim();
    }

    return {
      markdown: output ? "\n" + output.replace(/\n{3,}/g, "\n\n").trim() + "\n" : "",
      uploadFailures: uploadFailures
    };
  }

  async function handleImageInsert(files, sourceContext) {
    if (!files.length) {
      return;
    }

    showToast("正在上传图片...", "info");

    try {
      var markdownChunks = [];
      var uploadFailures = [];
      for (var i = 0; i < files.length; i += 1) {
        var uploadResult = await uploadImageToMarkdown(files[i]);
        if (uploadResult.error) {
          uploadFailures.push(uploadResult.error);
        }
        markdownChunks.push(uploadResult.markdown);
      }

      var inserted = insertMarkdownIntoCms(markdownChunks.join("\n"), sourceContext);
      if (!inserted) {
        throw new Error("未找到可写入内容的编辑器区域。");
      }

      updateRevisionField();
      if (uploadFailures.length) {
        showToast("图片上传失败，已改为内联图片写入 Markdown。内联图片可发布，但会增加文章文件大小。", "error");
      } else {
        showToast("图片已上传并写入 Markdown 正文，请点击保存或发布。", "success");
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "图片上传失败，请查看控制台日志。", "error");
    }
  }

  async function handleClipboardPaste(files, html, plainText, sourceContext) {
    showToast("正在处理粘贴内容...", "info");

    try {
      var result = await buildClipboardPasteMarkdown(html, plainText, files);
      if (!result.markdown) {
        throw new Error("未读取到可插入的文本或图片内容。");
      }

      var inserted = insertMarkdownIntoCms(result.markdown, sourceContext);
      if (!inserted) {
        throw new Error("未找到可写入内容的编辑器区域。");
      }

      updateRevisionField();
      if (result.uploadFailures.length) {
        showToast("部分图片上传失败，已改为内联图片写入 Markdown。内联图片可发布，但会增加文章文件大小。", "error");
      } else {
        showToast("粘贴内容已写入 Markdown 正文，请点击保存或发布。", "success");
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "粘贴内容处理失败，请查看控制台日志。", "error");
    }
  }

  function buildCurrentEditorSourceContext(sourceNode) {
    var selectionNode = getSelectionAnchorNode() || sourceNode || document.activeElement;
    var slateSelectionContext = getSlateSelectionContext(selectionNode);
    var slateBlockOffset = slateSelectionContext.slateBlockOffset;
    var globalOffset = null;
    var slateBlockText = null;
    var slateBlockIndex = null;

    if (slateSelectionContext.slateBlock && typeof slateBlockOffset === "number" && isFinite(slateBlockOffset)) {
      var controller = findSlateRawController({
        sourceNode: sourceNode || document.activeElement,
        activeElement: document.activeElement,
        path: []
      });
      if (controller && isSlateValue(controller.value)) {
        globalOffset = getOffsetForSlateBlock(controller.value, slateSelectionContext.slateBlock, slateBlockOffset);
        var blockIndex = controller.value.indexOf(slateSelectionContext.slateBlock);
        if (blockIndex !== -1) {
          slateBlockText = getSlateBlockText(slateSelectionContext.slateBlock);
          slateBlockIndex = blockIndex;
        }
      }
    }

    if (globalOffset === null) {
      globalOffset = getSelectionCharacterOffset(selectionNode);
    }

    return {
      sourceNode: sourceNode || document.activeElement,
      activeElement: document.activeElement,
      path: [],
      selectionOffset: globalOffset,
      slateBlock: slateSelectionContext.slateBlock,
      slateBlockOffset: slateSelectionContext.slateBlockOffset,
      slateBlockText: slateBlockText,
      slateBlockIndex: slateBlockIndex
    };
  }

  function rememberEditorSourceContext(sourceNode) {
    if (!sourceNode || sourceNode === document.body || sourceNode === document.documentElement) {
      return;
    }

    var candidate = closestEditorCandidate(sourceNode);
    var slateNode = findNearestSlateElementNode(sourceNode);
    var editableRoot = findNearestEditableRoot(sourceNode);

    if (!candidate && !slateNode && !editableRoot) {
      return;
    }

    lastEditorSourceContext = buildCurrentEditorSourceContext(sourceNode);
  }

  function handleVideoInsert(sourceContext) {
    var insertContext = sourceContext || lastEditorSourceContext || buildCurrentEditorSourceContext(document.activeElement);
    var videoUrl = window.prompt("Video URL (YouTube, Vimeo, Bilibili, mp4, webm, ogg):");
    if (videoUrl === null) {
      return;
    }

    var embedHtml = buildVideoEmbedHtml(videoUrl, window.prompt("Video title (optional):") || "");
    if (!embedHtml) {
      showToast("Please enter a video URL.", "error");
      return;
    }

    try {
      insertMarkdownIntoCms(embedHtml, insertContext);
      updateRevisionField();
      showToast("Video embed inserted. Save or publish the entry when ready.", "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Unable to insert video. Click inside the article body first.", "error");
    }
  }

  function ensureVideoInsertButton() {
    if (document.getElementById("cms-video-insert-button")) {
      return;
    }

    var button = document.createElement("button");
    button.id = "cms-video-insert-button";
    button.type = "button";
    button.textContent = "Insert video";
    if (button.setAttribute) {
      button.setAttribute("aria-label", "Insert video into article body");
    }
    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = "72px";
    button.style.zIndex = "99998";
    button.style.border = "0";
    button.style.borderRadius = "8px";
    button.style.background = "#0f766e";
    button.style.color = "#ffffff";
    button.style.padding = "10px 14px";
    button.style.font = "700 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    button.style.boxShadow = "0 12px 28px rgba(15, 118, 110, 0.28)";
    button.style.cursor = "pointer";
    if (button.addEventListener) {
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
      button.addEventListener("click", function () {
        handleVideoInsert(lastEditorSourceContext);
      });
    }

    document.body.appendChild(button);
  }

  document.addEventListener(
    "paste",
    function (event) {
      var files = collectPastedImages(event);
      var html = getClipboardHtml(event);
      var hasHtmlImages = containsHtmlImages(html);
      if (!files.length && !hasHtmlImages) {
        return;
      }

      var sourceContext = buildImageInsertSourceContext(event);
      claimImageEvent(event);
      if (hasHtmlImages) {
        handleClipboardPaste(files, html, getClipboardPlainText(event), sourceContext);
      } else {
        handleImageInsert(files, sourceContext);
      }
    },
    true
  );

  document.addEventListener(
    "dragover",
    function (event) {
      var files = collectDroppedImages(event);
      if (!files.length) {
        return;
      }

      claimImageEvent(event);
    },
    true
  );

  document.addEventListener(
    "drop",
    function (event) {
      var files = collectDroppedImages(event);
      if (!files.length) {
        return;
      }

      var sourceContext = buildImageInsertSourceContext(event);
      claimImageEvent(event);
      handleImageInsert(files, sourceContext);
    },
    true
  );

  ["focusin", "keyup", "mouseup"].forEach(function (eventName) {
    document.addEventListener(
      eventName,
      function (event) {
        rememberEditorSourceContext(event.target);
      },
      true
    );
  });

  startTranslationProtection();
  registerMediaFallbackServiceWorker();
  ensureVideoInsertButton();
})();
