import React, { useState, useEffect, useMemo, useRef } from 'react'
import { parsePct } from '../../utils/format'

const PCT_OPTIONS = [
  { label: '25%',  value: '25%'  },
  { label: '50%',  value: '50%'  },
  { label: '75%',  value: '75%'  },
  { label: '100%', value: '100%' },
]

export default function TabelaClientes({ clientes, selected, setSelected, currentWeek, maxWeek = 5, dirtyRows, onFieldChange }) {
  const semanas = ['s1', 's2', 's3', 's4', 's5']

  const [filterText, setFilterText] = useState('')
  const [filterOpen, setFilterOpen]  = useState(false)
  const filterWrapRef = useRef(null)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    function handleOutside(e) {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target)) setFilterOpen(false)
    }
    if (filterOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [filterOpen])

  function handleSortClick(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key) {
    if (sortKey !== key) return <span className="sort-arrow sort-arrow-idle">⇅</span>
    return sortDir === 'asc'
      ? <span className="sort-arrow sort-arrow-active">↑</span>
      : <span className="sort-arrow sort-arrow-active">↓</span>
  }

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    let list = q ? clientes.filter(c => (c.nome || '').toLowerCase().includes(q)) : clientes
    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (sortKey === 'nome') {
          const va = (a.nome || '').toLowerCase()
          const vb = (b.nome || '').toLowerCase()
          return sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR')
        } else if (sortKey === 'ultimaVisita' || sortKey === 'proxVisita') {
          const toNum = v => {
            if (!v || v === '-') return 0
            const [d, m, y] = v.split('/')
            return parseInt(`${y}${m}${d}`, 10) || 0
          }
          const va = toNum(a[sortKey]), vb = toNum(b[sortKey])
          return sortDir === 'asc' ? va - vb : vb - va
        } else if (sortKey === 'pct') {
          const toPct = v => {
            const parsed = parsePct(v)
            return parsed == null ? -1 : parsed
          }
          const va = toPct(a.pct), vb = toPct(b.pct)
          return sortDir === 'asc' ? va - vb : vb - va
        } else {
          const va = Number(a[sortKey]) || 0, vb = Number(b[sortKey]) || 0
          return sortDir === 'asc' ? va - vb : vb - va
        }
      })
    }
    return list
  }, [clientes, filterText, sortKey, sortDir])

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function handleSemanaChange(id, s, rawValue) {
    onFieldChange(id, s, rawValue.replace(/[^0-9.]/g, ''))
  }

  function formatSales(value) {
    if (value == null || value === '' || value === '-') return '-'
    const number = Number(value)
    return Number.isFinite(number)
      ? number.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
      : value
  }

  function openWeeksForecast(c) {
    const conversion = parsePct(c.pct)
    if (conversion == null || Math.abs(conversion - 0.75) >= 0.001) return '-'

    const v = semanas
      .filter((_, i) => !currentWeek || (i + 1) >= Number(currentWeek))
      .reduce((acc, s) => acc + (Number(c[s]) || 0), 0)
    if (!v) return '-'
    return formatSales(v)
  }

  return (
    <div className="section-clientes">
      <table className="clientes-table">
        <colgroup>
          <col style={{ width: 'var(--cli-checkbox-width)' }} />
          <col style={{ width: 'var(--cli-lin-width)' }} />
          <col style={{ width: 'var(--cli-org-width)' }} />
          <col style={{ width: 'var(--cli-nome-width)' }} />
          <col style={{ width: 'var(--cli-ultima-visita-width)' }} />
          <col style={{ width: 'var(--cli-prox-visita-width)' }} />
          <col style={{ width: 'var(--cli-classificacao-width)' }} />
          <col style={{ width: 'var(--cli-bloco-width)' }} />
          <col style={{ width: 'var(--cli-actual-ns-width)' }} />
          <col style={{ width: 'var(--cli-col-ns-width)' }} />
          <col style={{ width: 'var(--cli-col-s-width)' }} />
          <col style={{ width: 'var(--cli-col-s-width)' }} />
          <col style={{ width: 'var(--cli-col-s-width)' }} />
          <col style={{ width: 'var(--cli-col-s-width)' }} />
          <col style={{ width: 'var(--cli-col-s-width)' }} />
          <col style={{ width: 'var(--cli-pct-width)' }} />
          <col style={{ width: 'var(--cli-obs-width)' }} />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Lin</th>
            <th>Organization</th>
            <th className="nome-col th-with-filter" style={{ textAlign: 'left' }}>
              <div className="th-filter-wrap" ref={filterWrapRef}>
                <span className="th-filter-label th-sortable" onClick={() => handleSortClick('nome')}>
                  Nome do Cliente {sortArrow('nome')}
                </span>
                <button
                  className={`th-filter-btn${filterText ? ' th-filter-btn-active' : ''}`}
                  title={filterText ? `Filtro: "${filterText}"` : 'Filtrar por nome'}
                  onClick={e => { e.stopPropagation(); setFilterOpen(v => !v) }}
                >
                  {filterText ? '▼●' : '▼'}
                </button>
                {filterOpen && (
                  <div className="th-filter-popover">
                    <input
                      autoFocus
                      className="th-filter-input"
                      type="text"
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      placeholder="Buscar nome..."
                      autoComplete="off"
                    />
                    <div className="th-filter-popover-footer">
                      <span className="th-filter-count">{filtered.length} resultado(s)</span>
                      {filterText && (
                        <button className="th-filter-clear" onClick={() => { setFilterText(''); setFilterOpen(false) }}>
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </th>
            <th className="th-sortable" onClick={() => handleSortClick('ultimaVisita')}>
              Última Visita Presencial {sortArrow('ultimaVisita')}
            </th>
            <th className="th-sortable" onClick={() => handleSortClick('proxVisita')}>
              Próxima Visita Presencial {sortArrow('proxVisita')}
            </th>
            <th>Classificação</th>
            <th>Bloco</th>
            <th className="th-sortable" onClick={() => handleSortClick('actualNS')}>
              Actual Net Sales {sortArrow('actualNS')}
            </th>
            <th className="th-sortable" onClick={() => handleSortClick('forecastMesNum')}>
              Forecast Net Sales Mês {sortArrow('forecastMesNum')}
            </th>
            {semanas.map((s, i) => {
              const weekNum   = i + 1
              const isCurrent = currentWeek && weekNum === Number(currentWeek)
              const isLocked  = currentWeek > 0 && weekNum < Number(currentWeek)
              const cls = i <= 2 ? 'group-forecast' : 'group-s4'
              return (
                <th key={s} className={`${cls} ${isCurrent ? 'week-current' : ''} ${isLocked ? 'week-locked' : ''}`}>
                  S{weekNum}
                </th>
              )
            })}
            <th className="th-sortable" onClick={() => handleSortClick('pct')}>
              % Conversão {sortArrow('pct')}
            </th>
            <th>Obs</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => {
            const isDirty = dirtyRows && dirtyRows.has(c.id)
            return (
              <tr key={c.id} className={isDirty ? 'row-dirty' : ''}>
                <td>
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} />
                </td>
                <td>{c.id}</td>
                <td>{c.org}</td>
                <td className="nome-col">{c.nome}</td>
                <td>{c.ultimaVisita}</td>
                <td>{c.proxVisita}</td>
                <td>{c.classificacao}</td>
                <td>{c.bloco}</td>
                <td className="num-col">{formatSales(c.actualNS)}</td>
                <td className="num-col">{openWeeksForecast(c)}</td>
                {semanas.map((s, i) => {
                  const weekNum = i + 1
                  const pastLock  = currentWeek > 0 && weekNum < currentWeek
                  const futureLock = weekNum > maxWeek
                  const locked = pastLock || futureLock
                  return (
                    <td key={s}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={c[s]}
                        readOnly={locked}
                        className={locked ? 'semana-fechada' : ''}
                        onChange={locked ? undefined : e => handleSemanaChange(c.id, s, e.target.value)}
                        placeholder={locked ? '' : '0'}
                      />
                    </td>
                  )
                })}
                <td>
                  <select value={c.pct || ''} onChange={e => onFieldChange(c.id, 'pct', e.target.value)} className="select-inline">
                    <option value="">-</option>
                    {PCT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="td-obs">
                  <div className="obs-scroll-wrap">
                    <input
                      type="text"
                      value={c.Obs || ''}
                      onChange={e => onFieldChange(c.id, 'Obs', e.target.value)}
                      className="input-obs"
                      placeholder="Visita"
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
