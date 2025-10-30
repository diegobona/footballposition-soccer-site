export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const origin = url.origin;

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)decap_oauth_state=([^;]+)/);
  const savedState = match ? match[1] : null;

  if (!code || !state || !savedState || state !== savedState) {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  if (!env.OAUTH_GITHUB_CLIENT_ID || !env.OAUTH_GITHUB_CLIENT_SECRET) {
    return new Response('Missing GitHub OAuth env vars', { status: 500 });
  }

  // 使用 x-www-form-urlencoded 提交，避免 GitHub 解析异常
  const body = new URLSearchParams({
    client_id: env.OAUTH_GITHUB_CLIENT_ID,
    client_secret: env.OAUTH_GITHUB_CLIENT_SECRET,
    code,
    // 可留空使用注册的默认回调；保留也可，但需与注册一致
    redirect_uri: `${origin}/oauth/callback`,
  });

  const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    return new Response(`Token exchange failed: ${text}`, { status: 500 });
  }

  const data = await tokenResp.json();
  if (!data.access_token) {
    // 脱敏调试：仅输出长度与是否存在，帮助确认变量已被读取并提交
    const clientIdLen = String(env.OAUTH_GITHUB_CLIENT_ID || '').length;
    const clientSecretLen = String(env.OAUTH_GITHUB_CLIENT_SECRET || '').length;
    return new Response(
      `Token missing: ${JSON.stringify(data)} | debug: client_id_len=${clientIdLen}, client_secret_len=${clientSecretLen}`,
      { status: 500 }
    );
  }

  const access_token = data.access_token;
  const message = 'authorization:github:success:' + JSON.stringify({
    token: access_token,
    provider: 'github',
  });
  const html = `<!doctype html>
<html><body>
<script>
  (function () {
    try {
      if (window.opener && window.opener.postMessage) {
        try { window.opener.postMessage("authorizing:github", "*"); } catch (e) {}
        window.opener.postMessage(${JSON.stringify(message)}, "*");
      }
    } catch (e) {}
    window.close();
  })();
</script>
</body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}