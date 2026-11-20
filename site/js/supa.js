const { supabaseUrl, supabaseKey } = window.ZSS_CONFIG ?? {};
let client = null;
if (typeof supabaseUrl === 'string' && supabaseUrl.startsWith('https://') &&
    typeof supabaseKey === 'string' && supabaseKey.trim()) {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm');
    client = createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch(input, init = {}) {
          const timeout = AbortSignal.timeout(9000);
          const original = init.signal ?? (input instanceof Request ? input.signal : undefined);
          return fetch(input, { ...init, signal: original ? AbortSignal.any([original, timeout]) : timeout });
        }
      }
    });
  } catch {
    // The public snapshot does not depend on the CDN or Supabase.
  }
}
export const supa = client;

async function authCall(method, ...args) {
  if (!supa) throw new Error('Account service unavailable.');
  const { data, error } = await supa.auth[method](...args);
  if (error) throw error;
  return data;
}
export async function getSession() {
  return supa ? (await authCall('getSession')).session : null;
}
export const signIn = (email, password) => authCall('signInWithPassword', { email, password });
export const signUp = (email, password) => authCall('signUp', { email, password });
export const signOut = () => authCall('signOut');
export const updatePassword = password => authCall('updateUser', { password });
