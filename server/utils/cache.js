// Cache em memória com TTL simples.
// Não é compartilhado entre workers PM2 — adequado para uso single-process.

const store = new Map()

function get(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiry) { store.delete(key); return undefined }
  return entry.value
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiry: Date.now() + ttlMs })
}

function del(key) { store.delete(key) }

// Apaga todas as entradas cujas chaves começam com prefix
function delByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

function clear() { store.clear() }

module.exports = { get, set, del, delByPrefix, clear }
