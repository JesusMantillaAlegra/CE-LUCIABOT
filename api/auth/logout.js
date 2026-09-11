export default function handler(req, res) {
  const logoutTs = Math.floor(Date.now() / 1000);
  const cookies = [
    `auth_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    `auth_logged_out=${logoutTs}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
  ];

  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', cookies);
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    res.end();
  } else {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const base  = process.env.APP_URL || `${proto}://${host}`;
    res.writeHead(302, {
      Location: `${base}/login.html?logout=1`,
      'Cache-Control': 'no-store',
      'Set-Cookie': cookies,
    });
    res.end();
  }
}
