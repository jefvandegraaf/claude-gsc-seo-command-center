// Keys never live in the repo or in sites.json.
//  - CLI / scheduled task: environment variables.
//  - Desktop app: encrypted with the operating system's keychain (Electron safeStorage) and passed in.
// Core code only ever receives a plain `secrets` object; it never reads or writes keys itself.
import { readFileSync } from 'node:fs';

export const SECRET_NAMES = {
  googleServiceAccount: 'Google service account JSON (Search Console + GA4)',
  anthropicApiKey: 'Claude API key (only for AI summaries with ai = "api")',
  resendApiKey: 'Resend API key (sending the Monday email)',
  fathomApiToken: 'Fathom API token (only if you use Fathom)',
  psiApiKey: 'Google PageSpeed Insights API key (optional, for speed checks)',
};

export function secretsFromEnv(env = process.env) {
  let sa = env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!sa && env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { sa = readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'); } catch { sa = ''; }
  }
  return {
    googleServiceAccount: sa,
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    resendApiKey: env.RESEND_API_KEY || '',
    fathomApiToken: env.FATHOM_API_TOKEN || '',
    psiApiKey: env.PSI_API_KEY || '',
  };
}

// For logs and UI: which keys are present, never their values.
export const secretStatus = (s) => Object.fromEntries(Object.keys(SECRET_NAMES).map((k) => [k, Boolean(s[k])]));
