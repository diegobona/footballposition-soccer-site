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

  // 兑换 access_token
  const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.OAUTH_GITHUB_CLIENT_ID,
      client_secret: env.OAUTH_GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/oauth/callback`,
    }),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    return new Response(`Token exchange failed: ${text}`, { status: 500 });
  }

  const { access_token } = await tokenResp.json();
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
        // 兼容握手
        try { window.opener.postMessage("authorizing:github", "*"); } catch (e) {}
        // 登录成功消息，用 * 兼容不同来源
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