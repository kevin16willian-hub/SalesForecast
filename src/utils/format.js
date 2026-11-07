// Formata fração como porcentagem pt-BR (ex: 0.856 → "85,6%")
export function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '-'
  return (Number(n) * 100).toFixed(1).replace('.', ',') + '%'
}

// Converte "75%", "0,75" ou "0.75" para fração 0-1
export function parsePct(v) {
  if (v == null || v === '') return null
  let s = String(v).trim()
  if (s.endsWith('%')) {
    s = s.slice(0, -1).replace(/\s/g, '').replace(',', '.')
    const n = Number(s)
    return Number.isFinite(n) ? n / 100 : null
  }
  s = s.replace(/\s/g, '').replace(/,/g, '.')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

// Retorna "HH:MM - YYYY.MM.DD"
export function formatNow() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${hh}:${mm} - ${yyyy}.${mo}.${dd}`
}

// Retorna "MAR 2026"
export function formatAnoMes(d = new Date()) {
  const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
  return `${months[d.getMonth()] || ''} ${d.getFullYear()}`
}

// Converte decimal do banco (0.25, 0.5, 0.75, 1) para string de exibição
export function decimalToPctStr(v) {
  if (v == null || v === '') return ''
  switch (String(Number(v))) {
    case '0.25': return '25%'
    case '0.5':  return '50%'
    case '0.75': return '75%'
    case '1':    return '100%'
    default:     return String(v)
  }
}

// Converte string monetária pt-BR para número
export function parseNum(v) {
  if (v == null || v === '') return 0
  let s = String(v).trim().replace('R$', '').replace(/\s/g, '')
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(/,/g, '.')
  } else if (s.includes(',')) {
    s = s.replace(/,/g, '.')
  }
  s = s.replace(/[^0-9.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
