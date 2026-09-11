import { jwtVerify } from 'jose';

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
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const email = payload.email;
    if (!email?.endsWith('@alegra.com')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const logoutTs = parseInt(cookies.auth_logged_out || '0');
    if (logoutTs > 0 && (payload.iat ?? 0) <= logoutTs) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ name: payload.name, email });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
