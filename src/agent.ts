/**
 * The honest User-Agent every request carries: the bot's name, the site, and a contact: the owner's email
 * when one is set, otherwise the repository's issues page.
 */
import type { Config } from './config.ts';
import { optionalEnv } from './env.ts';

export function userAgent(cfg: Config): string {
  const issues = cfg.site.repo_url ? `${cfg.site.repo_url.replace(/\/+$/, '')}/issues` : '';
  const contact = optionalEnv('CONTACT_EMAIL') ?? issues;
  return `ZeroSeShuruBot/2.0 (+${cfg.site.public_url}${contact ? `; ${contact}` : ''})`;
}
