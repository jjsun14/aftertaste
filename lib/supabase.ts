import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = 'https://wowhufbfgvnbnhunquiq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvd2h1ZmJmZ3ZuYm5odW5xdWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njg3NDksImV4cCI6MjA4NzA0NDc0OX0.sJ32JYxKyE-Y2TNDAcHgYnoKI3muMc6y9fK-n7CVIew';

// SecureStore adapter so Supabase persists the session natively
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
