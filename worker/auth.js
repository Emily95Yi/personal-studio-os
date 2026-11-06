import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks;
let issuer;

export function isConfigured(env) {
  return Boolean(env.DB && env.ICAL_ENCRYPTION_KEY &&
    /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM ?? '') &&
    env.ACCESS_AUD && /^https:\/\/[a-z0-9.-]+$/.test(env.STUDIO_ORIGIN ?? ''));
}

export async function authenticate(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 8192) return null;
  const expectedIssuer = 'https://' + env.ACCESS_TEAM;
  if (issuer !== expectedIssuer) {
    issuer = expectedIssuer;
    jwks = createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'), { timeoutDuration: 5000 });
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: expectedIssuer, audience: env.ACCESS_AUD, algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp'],
    });
    return payload.type === 'app' && typeof payload.email === 'string' && payload.email && typeof payload.sub === 'string' && payload.sub
      ? payload.sub : null;
  } catch {
    return null;
  }
}
