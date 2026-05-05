(function () {
  "use strict";

  var enhancerConfig = window.CMS_ENHANCER_CONFIG || {};
  var repoOwner = enhancerConfig.repoOwner || "";
  var repoName = enhancerConfig.repoName || "";
  var branch = enhancerConfig.branch || "main";
  var mediaFolder = enhancerConfig.mediaFolder || "static/images/uploads";
  var publicFolder = enhancerConfig.publicFolder || "/images/uploads";
  var githubApiRoot = enhancerConfig.githubApiRoot || "https://api.github.com";
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
      publicUrl: publicFolder + "/" + year + "/" + month + "/" + fileName
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

  function getEditorTarget(candidate) {
    var node = candidate;

    if (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    var possibilities = [node, document.activeElement];

    for (var i = 0; i < possibilities.length; i += 1) {
      var element = possibilities[i];
      if (!element || !element.closest) {
        continue;
      }

      var codeMirrorHost = element.closest(".CodeMirror");
      if (codeMirrorHost) {
        return codeMirrorHost;
      }

      var textarea = element.closest("textarea");
      if (textarea) {
        return textarea;
      }

      var editable = element.closest('[contenteditable="true"]');
      if (editable) {
        return editable;
      }
    }

    return null;
  }

  function setTextareaValue(textarea, text) {
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var currentValue = textarea.value || "";
    var nextValue = currentValue.slice(0, start) + text + currentValue.slice(end);

    textarea.value = nextValue;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();
  }

  function insertIntoContentEditable(editable, text) {
    editable.focus();

    if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
      document.execCommand("insertText", false, text);
    } else {
      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        editable.appendChild(document.createTextNode(text));
      } else {
        var range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    editable.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insertMarkdown(target, text) {
    if (!target) {
      return false;
    }

    if (target.classList && target.classList.contains("CodeMirror") && target.CodeMirror) {
      target.CodeMirror.focus();
      target.CodeMirror.replaceSelection(text, "around");
      return true;
    }

    if (target.matches && target.matches("textarea, input")) {
      setTextareaValue(target, text);
      return true;
    }

    if (target.isContentEditable) {
      insertIntoContentEditable(target, text);
      return true;
    }

    return false;
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

    if (!repoOwner || !repoName) {
      throw new Error("CMS 图片上传配置缺失，请检查仓库配置。");
    }

    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      throw new Error("只支持上传图片文件。");
    }

    if (file.size > maxFileSize) {
      throw new Error("图片过大，当前限制为 10MB。");
    }

    var pathInfo = buildFilePath(file);
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

  async function handleImageInsert(files, target) {
    if (!files.length) {
      return;
    }

    if (!target) {
      showToast("请先把光标放到文章正文里，再粘贴或拖拽图片。", "error");
      return;
    }

    showToast("正在上传图片...", "info");

    try {
      var markdownChunks = [];
      for (var i = 0; i < files.length; i += 1) {
        var result = await uploadImage(files[i]);
        markdownChunks.push(buildMarkdown(files[i], result.publicUrl));
      }

      var inserted = insertMarkdown(target, markdownChunks.join("\n"));
      if (!inserted) {
        throw new Error("未找到可写入内容的编辑器区域。");
      }

      showToast("图片已上传并插入正文。", "success");
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

      var target = getEditorTarget(event.target);
      event.preventDefault();
      handleImageInsert(files, target);
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

      if (getEditorTarget(event.target)) {
        event.preventDefault();
      }
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

      var target = getEditorTarget(event.target);
      if (!target) {
        return;
      }

      event.preventDefault();
      handleImageInsert(files, target);
    },
    true
  );
})();
