import { randomBytes } from 'crypto';

export default function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const base  = process.env.APP_URL || `${proto}://${host}`;
  const isSecure = base.startsWith('https');

  const state = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${base}/api/auth/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    hd:            'alegra.com',
    access_type:   'online',
    state,
  });

  res.setHeader('Set-Cookie',
    `oauth_state=${state}; Path=/api/auth; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=300`
  );
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
