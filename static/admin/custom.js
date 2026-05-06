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

  function buildMarkdown(file, publicUrl) {
    return "\n![" + getAltText(file) + "](" + publicUrl + ")\n";
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
    var separator = currentValue && !/\n$/.test(currentValue) && !/^\n/.test(text) ? "\n" : "";
    controller.onChange(currentValue + separator + text);
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
      .map(function (line) {
        return {
          type: "paragraph",
          children: [{ text: line }]
        };
      });
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
          if (props && typeof props.onChange === "function" && isSlateRawValue(props.value)) {
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

    var currentValue = slateRawValueToText(controller.value);
    var separator = currentValue && !/\n$/.test(currentValue) && !/^\n/.test(text) ? "\n" : "";
    controller.onChange(textToSlateRawValue(currentValue + separator + text));
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
    throw new Error("未找到正文编辑器，请先点击文章正文区域后再粘贴图片。");
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

  async function handleImageInsert(files, sourceContext) {
    if (!files.length) {
      return;
    }

    showToast("正在上传图片...", "info");

    try {
      var markdownChunks = [];
      var uploadFailures = [];
      for (var i = 0; i < files.length; i += 1) {
        try {
          var result = await uploadImage(files[i]);
          await cacheImageForLocalPreview(result.publicUrl, files[i]);
          markdownChunks.push(buildMarkdown(files[i], result.publicUrl));
        } catch (uploadError) {
          uploadFailures.push(uploadError);
          console.warn("CMS image paste warning: GitHub upload failed, using inline image fallback", uploadError);
          markdownChunks.push(await buildInlineMarkdown(files[i]));
        }
      }

      var inserted = insertMarkdownIntoCms(markdownChunks.join("\n"), sourceContext);
      if (!inserted) {
        throw new Error("未找到可写入内容的编辑器区域。");
      }

      updateRevisionField();
      if (uploadFailures.length) {
        showToast("GitHub 上传失败，已改为内联图片写入 Markdown。内联图片可发布，但会增加文章文件大小。", "error");
      } else {
        showToast("图片已上传并写入 Markdown 正文，请点击保存或发布。", "success");
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "图片上传失败，请查看控制台日志。", "error");
    }
  }

  document.addEventListener(
    "paste",
    function (event) {
      var files = collectPastedImages(event);
      if (!files.length) {
        return;
      }

      var sourceContext = {
        sourceNode: event.target,
        activeElement: document.activeElement,
        path: getEventPathCandidates(event)
      };
      claimImageEvent(event);
      handleImageInsert(files, sourceContext);
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

      var sourceContext = {
        sourceNode: event.target,
        activeElement: document.activeElement,
        path: getEventPathCandidates(event)
      };
      claimImageEvent(event);
      handleImageInsert(files, sourceContext);
    },
    true
  );

  startTranslationProtection();
  registerMediaFallbackServiceWorker();
})();
