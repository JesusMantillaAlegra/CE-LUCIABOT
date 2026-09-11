import { SignJWT } from 'jose';

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const base  = process.env.APP_URL || `${proto}://${host}`;

  if (error || !code) {
    return res.redirect(`/login.html?error=oauth_denied`);
  }

  const storedState = parseCookies(req.headers.cookie).oauth_state;
  if (!state || state !== storedState) {
    return res.redirect(`/login.html?error=state_mismatch`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${base}/api/auth/callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.id_token) throw new Error('No id_token');

    const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
    const email = payload.email || '';
    const name  = payload.name  || email;

    if (!email.endsWith('@alegra.com')) {
      return res.redirect(`/login.html?error=domain_not_allowed`);
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ email, name, picture: payload.picture })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(secret);

    const isSecure = base.startsWith('https');
    res.setHeader('Set-Cookie', [
      `auth_token=${jwt}; Path=/; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=86400`,
      `oauth_state=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax`,
    ]);
    res.redirect('/');
  } catch (err) {
    console.error('Auth error:', err);
    res.redirect(`/login.html?error=token_failed`);
  }
}
