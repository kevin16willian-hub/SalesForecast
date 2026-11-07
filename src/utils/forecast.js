// Extrai GrupoRegID do texto "Nome #123"
export function parseGrupoFromAssessor(s) {
  if (!s) return 225
  const m = String(s).match(/#(\d+)/)
  return m ? Number(m[1]) : 225
}

// Detecta valores negativos/positivos para classe CSS de cor
export function isNeg(v) { return typeof v === 'string' && v.startsWith('-') }
export function isPos(v) { return typeof v === 'string' && v.startsWith('+') }

// Retorna a semana do mês (1-5) do dia de hoje, usando a tabela de workdays
export function getCurrentWeekOfMonth(wdList) {
  if (!wdList || !wdList.length) return 0
  const today = new Date()
  const year  = today.getUTCFullYear()
  const month = today.getUTCMonth() + 1
  const day   = String(today.getUTCDate()).padStart(2, '0')
  const row   = wdList.find(w =>
    Number(w.Year)  === year &&
    Number(w.Month) === month &&
    String(w.Day).padStart(2, '0') === day
  )
  return row ? Number(row.WeekOfMonth) : 0
}
