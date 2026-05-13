import { createClient } from '@supabase/supabase-js';

const LS_URL = '_sb_url';
const LS_KEY = '_sb_key';
const DOMAIN = '@fitofichas.local'; // sufijo interno para usernames sin @

let _client = null;

export function sbConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || localStorage.getItem(LS_URL) || '',
    key: import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem(LS_KEY) || '',
  };
}

export function sbSetConfig(url, key) {
  localStorage.setItem(LS_URL, url.trim());
  localStorage.setItem(LS_KEY, key.trim());
  _client = null;
}

export function sbClearConfig() {
  localStorage.removeItem(LS_URL);
  localStorage.removeItem(LS_KEY);
  _client = null;
}

export function sbClient() {
  const { url, key } = sbConfig();
  if (!url || !key) return null;
  if (!_client) _client = createClient(url, key);
  return _client;
}

export const sbReady = () => {
  const { url, key } = sbConfig();
  return Boolean(url && key);
};

// Convierte "admin" → "admin@fitofichas.local", emails completos los deja igual
export const toEmail = u => u.includes('@') ? u : `${u.toLowerCase()}${DOMAIN}`;

// Convierte "admin@fitofichas.local" → "admin", otros emails los deja igual
export const toDisplay = email =>
  email?.endsWith(DOMAIN) ? email.slice(0, -DOMAIN.length) : email;

// Login con usuario o email
export async function sbSignIn(username, password) {
  const sb = sbClient();
  if (!sb) return { error: { message: 'Base de datos no configurada.' } };
  return sb.auth.signInWithPassword({ email: toEmail(username), password });
}

// Cierre de sesión
export async function sbSignOut() {
  const sb = sbClient();
  if (sb) await sb.auth.signOut();
}

// Sesión activa actual (async)
export async function sbGetSession() {
  const sb = sbClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}
