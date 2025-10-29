export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;

  const state = crypto.randomUUID();
  const callback = `${origin}/oauth/callback`;
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', env.OAUTH_GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', callback);
  authorizeUrl.searchParams.set('scope', 'repo'); // 可按需缩小为 "public_repo"
  authorizeUrl.searchParams.set('state', state);

  // 将 state 写入 Cookie 用于校验
  const headers = new Headers({
    Location: authorizeUrl.toString(),
    'Set-Cookie': `decap_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
  });
  return new Response(null, { status: 302, headers });
}