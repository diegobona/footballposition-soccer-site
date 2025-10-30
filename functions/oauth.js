export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;

  if (!env.OAUTH_GITHUB_CLIENT_ID) {
    return new Response('Missing OAUTH_GITHUB_CLIENT_ID', { status: 500 });
  }

  const state = crypto.randomUUID();
  const callback = `${origin}/oauth/callback`;
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', env.OAUTH_GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', callback);
  // 扩展权限，防止 /user 读取受限
  authorizeUrl.searchParams.set('scope', 'repo read:user user:email');
  authorizeUrl.searchParams.set('state', state);

  const headers = new Headers({
    Location: authorizeUrl.toString(),
    'Set-Cookie': `decap_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
  });
  return new Response(null, { status: 302, headers });
}