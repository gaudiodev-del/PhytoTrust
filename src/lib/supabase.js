import { createClient } from '@supabase/supabase-js';

const DOMAIN = '@phytotrust.local';

const URL_  = 'https://oldarvlnozzdewkeiuxz.supabase.co';
const KEY_  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZGFydmxub3p6ZGV3a2VpdXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTI4MTksImV4cCI6MjA5NDIyODgxOX0.RVNf81lKy3yGEAaSJ-gIbwR63ByQ8dSty7L3hNptYvU';

const _client = createClient(URL_, KEY_);

export const sbConfig  = () => ({ url: URL_, key: KEY_ });
export const sbReady   = () => true;
export const sbClient  = () => _client;
export const sbSetConfig  = () => {};
export const sbClearConfig = () => {};

export const toEmail = u => u.includes('@') ? u : `${u.toLowerCase()}${DOMAIN}`;
export const toDisplay = email =>
  email?.endsWith(DOMAIN) ? email.slice(0, -DOMAIN.length) : email;

export async function sbSignIn(username, password) {
  return _client.auth.signInWithPassword({ email: toEmail(username), password });
}

export async function sbSignOut() {
  await _client.auth.signOut();
}

export async function sbGetSession() {
  const { data: { session } } = await _client.auth.getSession();
  return session;
}
