/**
 * Keys come from environment variables: Windows user variables on the owner's laptop (tools/set-keys.ps1),
 * repository secrets in GitHub Actions. A `.env` file is read only if one exists, and never overrides a
 * variable that is already set. No message ever contains a value.
 */
import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  const head = readFileSync(path).subarray(0, 2);
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
    throw new Error('.env is saved as UTF-16. Save it as UTF-8.');
  }
  process.loadEnvFile(path);
}

/** A required value. The error names the variable, never its value. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. On the laptop run tools\\set-keys.ps1 and open a new terminal; in Actions add it as a secret.`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
