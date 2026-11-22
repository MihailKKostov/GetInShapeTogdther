// Fetch a public web page safely from a server: http(s) only, no private/internal addresses
// (re-checked on every redirect), a time limit and a size limit.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class UserError extends Error {}

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new UserError('That doesn\'t look like a web address'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UserError('Only http(s) links are supported');
  if (url.username || url.password) throw new UserError('Links with passwords are not supported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UserError('Couldn\'t find that website');
  if (addrs.some((a) => isPrivate(a.address))) throw new UserError('That address isn\'t allowed');
  return url;
}

export async function fetchPage(raw) {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WeFitRecipeImport/1.0)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    }).catch((e) => { throw new UserError(e?.name === 'TimeoutError' ? 'The website took too long to answer' : 'Couldn\'t reach that website'); });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (!res.ok) throw new UserError(`The website answered with an error (${res.status})`);
    const type = res.headers.get('content-type') || '';
    if (!/html|xml/i.test(type)) throw new UserError('That link isn\'t a web page');
    // Read up to MAX_BYTES.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: url.toString() };
  }
  throw new UserError('Too many redirects');
}
