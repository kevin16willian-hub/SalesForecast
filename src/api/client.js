export const API_BASE = import.meta.env.VITE_API_BASE || ''

let onSessionExpired = null
export function setSessionExpiredCallback(cb) { onSessionExpired = cb }

export async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts })
  if (res.status === 401 && typeof onSessionExpired === 'function') {
    onSessionExpired()
  }
  return res
}
