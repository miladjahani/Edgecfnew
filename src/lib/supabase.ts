import { createClient } from '@supabase/supabase-js'
import CryptoJS from 'crypto-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Encryption key for token encryption (should be moved to environment variable in production)
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'miliconfig-pro-secret-key-2024'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Encrypt token before storing
export const encryptToken = (token: string): string => {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString()
}

// Decrypt token when retrieving
export const decryptToken = (encryptedToken: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}
