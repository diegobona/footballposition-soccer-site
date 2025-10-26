// Proxy for Netlify Identity API
export async function onRequest(context) {
  const { request, params } = context;
  const path = params.path || '';

  // 构建目标URL
  const targetUrl = `https://footballposition-soccer-identity.netlify.app/.netlify/identity/${path}${new URL(request.url).search}`;

  try {
    // 代理请求到Netlify Identity
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'Host': 'footballposition-soccer-identity.netlify.app',
        'Origin': 'https://footballposition-soccer.pages.dev'
      },
      body: request.body,
      redirect: 'follow'
    });

    // 添加CORS头
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });

  } catch (error) {
    console.error('Identity proxy error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}