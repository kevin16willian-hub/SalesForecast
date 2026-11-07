import React, { useMemo } from 'react'
import { isNeg, isPos } from '../../utils/forecast'

export default function Indicadores({ indicadores, currentWeek }) {
  const semanas = ['s1', 's2', 's3', 's4', 's5']

  function formatMoeda(v) {
    const n = Number(v)
    if (Number.isFinite(n)) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return v || '-'
  }

  return (
    <div className="section-indicadores">
      <div className="indicadores-header">Indicadores</div>
      <table className="indicadores-table">
        <colgroup>
          <col />
          <col style={{ width: 'var(--ind-col-ns-width)' }} />
          <col style={{ width: 'var(--ind-col-s-width)' }} />
          <col style={{ width: 'var(--ind-col-s-width)' }} />
          <col style={{ width: 'var(--ind-col-s-width)' }} />
          <col style={{ width: 'var(--ind-col-s-width)' }} />
          <col style={{ width: 'var(--ind-col-s-width)' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="label-col" rowSpan={2}></th>
            <th rowSpan={2}>Net Sales Mês</th>
            <th colSpan={5}>Forecast Net Sales</th>
          </tr>
          <tr>
            {semanas.map((s, i) => {
              const weekNum  = i + 1
              const isCurrent = currentWeek && weekNum === Number(currentWeek)
              const isLocked  = currentWeek > 0 && weekNum < Number(currentWeek)
              const cls = i <= 2 ? 'group-forecast' : 'group-s4'
              return (
                <th key={s} className={`${cls} ${isCurrent ? 'week-current' : ''} ${isLocked ? 'week-locked' : ''}`}>
                  S{weekNum}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {indicadores.map((row, idx) => (
            <tr key={idx} className={row.highlight ? 'highlight' : ''}>
              <td className="label-col">{row.label}</td>
              {['netSalesMes', ...semanas].map((k, ki) => {
                const v          = row[k]
                const signClass  = isNeg(String(v)) ? 'neg' : isPos(String(v)) ? 'pos' : ''
                const weekNum    = ki
                const isLockedCell = k.startsWith('s') && currentWeek > 0 && weekNum < Number(currentWeek)
                let display
                if (typeof v === 'string' && v.includes('%')) {
                  display = v
                } else if (k === 'netSalesMes' || k.startsWith('s')) {
                  display = formatMoeda(v)
                } else {
                  display = v || '-'
                }
                return (
                  <td key={k} className={`num-col ${signClass} ${isLockedCell ? 'td-week-locked' : ''}`}>
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
