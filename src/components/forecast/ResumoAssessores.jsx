import React, { useMemo, useState } from 'react'
import { getCurrentWeekOfMonth } from '../../utils/forecast'

export default function ResumoAssessores({ resumo, workdays }) {
  const currentWeek = useMemo(() => getCurrentWeekOfMonth(workdays), [workdays])
  const [sortDir, setSortDir] = useState('asc')

  function sortArrow() {
    return sortDir === 'asc' ? '↑' : '↓'
  }

  const resumoOrdenado = useMemo(() => {
    const list = [...resumo]
    list.sort((a, b) => {
      const va = (a.nome || '').toLowerCase()
      const vb = (b.nome || '').toLowerCase()
      return sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR')
    })
    return list
  }, [resumo, sortDir])

  function fmtR(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '-'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  function fmtPctLocal(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '-'
    return (n * 100).toFixed(1).replace('.', ',') + '%'
  }

  function openWeeksSum(perWeek) {
    return (perWeek || []).reduce((acc, v, i) => {
      return (!currentWeek || (i + 1) >= currentWeek) ? acc + (v || 0) : acc
    }, 0)
  }

  function computeRealizadoForecast(row) {
    let total = 0
    for (let i = 0; i < 5; i++) {
      const weekNum = i + 1
      const closed  = workdays.some(w => Number(w.WeekOfMonth) === weekNum && Number(w.Closed) === 1)
        || (currentWeek > weekNum)
      total += closed ? (row.vendasPorSemana[i] || 0) : (row.f75PorSemana[i] || 0)
    }
    return total
  }

  return (
    <div className="section-indicadores" style={{ width: '100%', marginLeft: 0, marginRight: 0 }}>
      <div className="indicadores-header">Indicadores por Assessor</div>
      <table className="indicadores-table" style={{ tableLayout: 'auto', width: '100%' }}>
        <thead>
          <tr>
            <th
              className="label-col th-sortable"
              style={{ textAlign: 'left', minWidth: 160 }}
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            >
              Regional Supervisor Assessor {sortArrow()}
            </th>
            <th style={{ minWidth: 100 }}>Meta Mês</th>
            <th style={{ minWidth: 100 }}>Realizado Mês</th>
            <th style={{ minWidth: 110 }}>Atingimento Realizado Mês (%)</th>
            <th style={{ minWidth: 130 }}>Realizado + Forecast Mês</th>
            <th style={{ minWidth: 100 }}>Forecast Mês (75%)</th>
            <th style={{ minWidth: 100 }}>Funil Mês (25% e 50%)</th>
          </tr>
        </thead>
        <tbody>
          {resumoOrdenado.map(r => {
            const ating             = r.metaMes > 0 ? r.vendasMes / r.metaMes : null
            const realizadoForecast = computeRealizadoForecast(r)
            const f75Open           = openWeeksSum(r.f75PorSemana)
            const funilOpen         = openWeeksSum(r.funilPorSemana)
            const isAbove           = ating != null && ating >= 1
            return (
              <tr key={r.grupoRegID}>
                <td className="label-col" style={{ textAlign: 'left' }}>{r.nome}</td>
                <td className="num-col">{fmtR(r.metaMes)}</td>
                <td className="num-col">{fmtR(r.vendasMes)}</td>
                <td className={`num-col ${isAbove ? 'pos' : ''}`}>
                  {ating != null ? fmtPctLocal(ating) : '-'}
                </td>
                <td className="num-col">{fmtR(realizadoForecast)}</td>
                <td className="num-col">{fmtR(f75Open)}</td>
                <td className="num-col">{fmtR(funilOpen)}</td>
              </tr>
            )
          })}
          {resumoOrdenado.length > 1 && (() => {
            const totMeta   = resumoOrdenado.reduce((s, r) => s + (r.metaMes || 0), 0)
            const totVendas = resumoOrdenado.reduce((s, r) => s + (r.vendasMes || 0), 0)
            const totRF     = resumoOrdenado.reduce((s, r) => s + computeRealizadoForecast(r), 0)
            const totF75    = resumoOrdenado.reduce((s, r) => s + openWeeksSum(r.f75PorSemana), 0)
            const totFunil  = resumoOrdenado.reduce((s, r) => s + openWeeksSum(r.funilPorSemana), 0)
            const totAting  = totMeta > 0 ? totVendas / totMeta : null
            const totIsAbove = totAting != null && totAting >= 1
            return (
              <tr className="highlight">
                <td className="label-col" style={{ textAlign: 'left', fontWeight: 700 }}>Total</td>
                <td className="num-col">{fmtR(totMeta)}</td>
                <td className="num-col">{fmtR(totVendas)}</td>
                <td className={`num-col ${totIsAbove ? 'pos' : ''}`}>{totAting != null ? fmtPctLocal(totAting) : '-'}</td>
                <td className="num-col">{fmtR(totRF)}</td>
                <td className="num-col">{fmtR(totF75)}</td>
                <td className="num-col">{fmtR(totFunil)}</td>
              </tr>
            )
          })()}
        </tbody>
      </table>
    </div>
  )
}
