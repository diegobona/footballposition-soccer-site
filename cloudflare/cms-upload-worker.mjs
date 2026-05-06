const DEFAULT_ALLOWED_ORIGINS = ["https://footballposition.soccer", "http://localhost:1313"];
const DEFAULT_GITHUB_REPO = "diegobona/footballposition-soccer-site";
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_MEDIA_OBJECT_FOLDER = "uploads";

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function getAllowedOrigins(env) {
  const configured = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = getAllowedOrigins(env);
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanPublicBaseUrl(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function normalizeObjectKey(key, env) {
  const objectFolder = String(env.MEDIA_OBJECT_FOLDER || DEFAULT_MEDIA_OBJECT_FOLDER).replace(/^\/+|\/+$/g, "");
  const normalized = String(key || "").replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized.includes("..") || normalized.includes("\\") || normalized.includes("?") || normalized.includes("#")) {
    return "";
  }

  if (normalized.indexOf(objectFolder + "/") !== 0) {
    return "";
  }

  if (!/^uploads\/\d{4}\/\d{2}\/[a-z0-9][a-z0-9.-]*\.(png|jpe?g|webp|gif|svg)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

async function verifyGitHubToken(token, env) {
  if (!token) {
    return false;
  }

  const repo = env.GITHUB_REPO || DEFAULT_GITHUB_REPO;
  const response = await fetch("https://api.github.com/repos/" + repo, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "footballposition-cms-upload",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  return response.ok;
}

async function handleUpload(request, env) {
  const corsHeaders = getCorsHeaders(request, env);

  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Missing MEDIA_BUCKET binding" }, 500, corsHeaders);
  }

  if (!env.MEDIA_PUBLIC_BASE_URL) {
    return jsonResponse({ error: "Missing MEDIA_PUBLIC_BASE_URL" }, 500, corsHeaders);
  }

  const token = getBearerToken(request);
  if (!(await verifyGitHubToken(token, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const key = normalizeObjectKey(formData.get("key"), env);
  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);

  if (!key) {
    return jsonResponse({ error: "Invalid upload key" }, 400, corsHeaders);
  }

  if (!file || typeof file.size !== "number" || typeof file.stream !== "function") {
    return jsonResponse({ error: "Missing image file" }, 400, corsHeaders);
  }

  if (!file.type || file.type.indexOf("image/") !== 0) {
    return jsonResponse({ error: "Only image uploads are allowed" }, 415, corsHeaders);
  }

  if (file.size > maxUploadBytes) {
    return jsonResponse({ error: "Image is too large" }, 413, corsHeaders);
  }

  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const publicBaseUrl = cleanPublicBaseUrl(env.MEDIA_PUBLIC_BASE_URL);
  return jsonResponse(
    {
      key,
      url: publicBaseUrl + "/" + key,
    },
    200,
    corsHeaders
  );
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST" || url.pathname !== "/upload") {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }

    try {
      return await handleUpload(request, env);
    } catch (error) {
      console.error("CMS R2 upload failed", error);
      return jsonResponse({ error: "Upload failed" }, 500, corsHeaders);
    }
  },
};
