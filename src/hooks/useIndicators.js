import { useMemo } from 'react'
import { getCurrentWeekOfMonth } from '../utils/forecast'
import { fmtPct, parsePct, parseNum } from '../utils/format'

// Reparte o saldo de cada semana encerrada entre as semanas futuras com meta, proporcional aos pesos.
function redistribuirMetaSemanal(metaBase, vendasPorSemana, semanaAtual, pesos, ultimaSemana) {
  const ajustada = metaBase.map(valor => valor === '-' ? '-' : Number(valor) || 0)
  const semanaLimite = Math.min(5, ultimaSemana)

  for (let semana = 1; semana < Math.min(semanaAtual, semanaLimite + 1); semana++) {
    if (ajustada[semana - 1] === '-') continue
    const futuras = []
    for (let proxima = semana + 1; proxima <= semanaLimite; proxima++) {
      if (ajustada[proxima - 1] !== '-') futuras.push(proxima)
    }
    if (!futuras.length) continue

    const saldo = ajustada[semana - 1] - (Number(vendasPorSemana[semana - 1]) || 0)
    const pesoDe = proxima => Math.max(0, Number(pesos[proxima - 1]) || 0)
    const pesoTotal = futuras.reduce((total, proxima) => total + pesoDe(proxima), 0)
    for (const proxima of futuras) {
      const peso = pesoTotal > 0 ? pesoDe(proxima) / pesoTotal : 1 / futuras.length
      ajustada[proxima - 1] += saldo * peso
    }
  }

  return ajustada
}

// Semanas encerradas exibem o realizado; semanas abertas exibem a meta ajustada.
function conciliarMetaSemanal(metaAjustada, vendasPorSemana, semanaAtual) {
  return metaAjustada.map((meta, index) => {
    if (meta === '-') return '-'
    return index + 1 < semanaAtual ? Number(vendasPorSemana[index]) || 0 : meta
  })
}

function somarSemanas(listas) {
  return [0, 1, 2, 3, 4].map(i => {
    const valores = listas.map(lista => lista[i]).filter(v => v != null && v !== '-')
    return valores.length ? valores.reduce((total, v) => total + (Number(v) || 0), 0) : '-'
  })
}

export default function useIndicators({
  clientes, vendas, workdays,
  targetTotal, targetWeeksMap,
  isGestor, assessorSel, resumoAssessores,
}) {
  const currentWeek = useMemo(() => getCurrentWeekOfMonth(workdays), [workdays])

  const computedIndicators = useMemo(() => {
    const hasAnyWeekTarget = [1, 2, 3, 4, 5].some(i =>
      [`S${i}`, `s${i}`, String(i)].some(k => Object.prototype.hasOwnProperty.call(targetWeeksMap, k))
    )
    const weekHasTarget = (i) =>
      [`S${i}`, `s${i}`, String(i)].some(k => Object.prototype.hasOwnProperty.call(targetWeeksMap, k))

    // ── Modo agregado: gestor sem assessor selecionado ──
    if (isGestor && !assessorSel && resumoAssessores.length > 0) {
      // Número real de semanas do mês — bloqueia S5 quando o mês só tem 4 semanas
      const maxWeekAgg = workdays.length ? Math.max(...workdays.map(w => Number(w.WeekOfMonth || 0))) : 4
      const weekInMonth = (i) => i <= maxWeekAgg

      const aggMetaWeeks = [0, 0, 0, 0, 0]
      resumoAssessores.forEach(r => {
        const perWeek = Array.isArray(r.metaPorSemana) ? r.metaPorSemana : []
        perWeek.forEach((v, i) => {
          if (i < 5) aggMetaWeeks[i] += Number(v) || 0
        })
      })
      const hasWeeklyMeta = aggMetaWeeks.some(v => Number(v) > 0)

      const getWeekShareAgg = (i) => {
        if (!weekInMonth(i)) return 0
        const candidates = [`S${i}`, `s${i}`, String(i)]
        for (const k of candidates) {
          if (Object.prototype.hasOwnProperty.call(targetWeeksMap, k)) return Number(targetWeeksMap[k]) || 0
        }
        return hasAnyWeekTarget ? 0 : 1 / maxWeekAgg
      }

      const aggMeta = resumoAssessores.reduce((s, r) => s + (r.metaMes || 0), 0)
      const aggVW = [0, 0, 0, 0, 0]
      resumoAssessores.forEach(r => { (r.vendasPorSemana || []).forEach((v, i) => { aggVW[i] += Number(v) || 0 }) })
      const aggVT = aggVW.reduce((s, v) => s + v, 0)
      const aggF75W = [0, 0, 0, 0, 0]
      resumoAssessores.forEach(r => { (r.f75PorSemana || []).forEach((v, i) => { aggF75W[i] += Number(v) || 0 }) })
      const aggFunilW = [0, 0, 0, 0, 0]
      resumoAssessores.forEach(r => { (r.funilPorSemana || []).forEach((v, i) => { aggFunilW[i] += Number(v) || 0 }) })

      const metaAgg = {
        label: 'Meta Semanal', netSalesMes: aggMeta,
        s1: hasWeeklyMeta ? aggMetaWeeks[0] : (hasAnyWeekTarget && !weekHasTarget(1) ? '-' : aggMeta * getWeekShareAgg(1)),
        s2: hasWeeklyMeta ? aggMetaWeeks[1] : (hasAnyWeekTarget && !weekHasTarget(2) ? '-' : aggMeta * getWeekShareAgg(2)),
        s3: hasWeeklyMeta ? aggMetaWeeks[2] : (hasAnyWeekTarget && !weekHasTarget(3) ? '-' : aggMeta * getWeekShareAgg(3)),
        s4: hasWeeklyMeta ? aggMetaWeeks[3] : (hasAnyWeekTarget && !weekHasTarget(4) ? '-' : aggMeta * getWeekShareAgg(4)),
        s5: !weekInMonth(5)
          ? '-'
          : (hasWeeklyMeta
            ? aggMetaWeeks[4]
            : (hasAnyWeekTarget && !weekHasTarget(5) ? '-' : aggMeta * getWeekShareAgg(5))),
      }
      const vendasAgg = {
        label: 'Vendas realizadas',
        netSalesMes: aggVT === 0 ? '-' : aggVT,
        s1: aggVW[0] === 0 ? '-' : aggVW[0], s2: aggVW[1] === 0 ? '-' : aggVW[1],
        s3: aggVW[2] === 0 ? '-' : aggVW[2], s4: aggVW[3] === 0 ? '-' : aggVW[3],
        s5: !weekInMonth(5) ? '-' : (aggVW[4] === 0 ? '-' : aggVW[4]),
      }
      const activeWeeks = [1, 2, 3, 4, 5].filter(i => weekInMonth(i))
      const forecast75Agg = {
        label: 'Forecast Preenchido (75%)',
        netSalesMes: activeWeeks.filter(i => !currentWeek || i >= currentWeek).reduce((acc, i) => acc + (aggF75W[i-1] || 0), 0),
        s1: aggF75W[0], s2: aggF75W[1], s3: aggF75W[2], s4: aggF75W[3],
        s5: !weekInMonth(5) ? '-' : aggF75W[4],
      }
      const forecast75AggTotalLive = aggF75W.reduce((acc, v) => acc + (Number(v) || 0), 0)
      const funilAgg = {
        label: 'Funil (25% e 50%)',
        netSalesMes: activeWeeks.filter(i => !currentWeek || i >= currentWeek).reduce((acc, i) => acc + (aggFunilW[i-1] || 0), 0),
        s1: aggFunilW[0], s2: aggFunilW[1], s3: aggFunilW[2], s4: aggFunilW[3],
        s5: !weekInMonth(5) ? '-' : aggFunilW[4],
      }

      // Redistribui por assessor (vendas e pesos diferem); assessor sem meta não redistribui.
      const porAssessor = hasWeeklyMeta
        ? resumoAssessores.map(a => {
            const vendasA = a.vendasPorSemana || []
            const base = [0, 1, 2, 3, 4].map(i => i < maxWeekAgg ? Number(a.metaPorSemana?.[i]) || 0 : '-')
            const temMeta = base.some(v => v !== '-' && v > 0)
            return {
              vendas: vendasA,
              historica: temMeta ? redistribuirMetaSemanal(base, vendasA, currentWeek, base, maxWeekAgg) : base,
            }
          })
        : [{
            vendas: aggVW,
            historica: redistribuirMetaSemanal(
              [1, 2, 3, 4, 5].map(i => metaAgg[`s${i}`]), aggVW, currentWeek,
              [1, 2, 3, 4, 5].map(i => getWeekShareAgg(i)), maxWeekAgg
            ),
          }]
      const metaHistAgg = somarSemanas(porAssessor.map(p => p.historica))
      const metaConciliadaAgg = somarSemanas(
        porAssessor.map(p => conciliarMetaSemanal(p.historica, p.vendas, currentWeek))
      )

      const metaMaisDiffAgg = { label: 'Realizado + meta a realizar', netSalesMes: aggMeta }
      for (let i = 1; i <= 5; i++) {
        metaMaisDiffAgg[`s${i}`] = weekInMonth(i) ? metaConciliadaAgg[i - 1] : '-'
      }

      const diffAgg = { label: 'Diferença para o atingimento da meta', highlight: true }
      diffAgg.netSalesMes = aggVT - aggMeta
      for (let i = 1; i <= 5; i++) {
        if (!weekInMonth(i)) { diffAgg[`s${i}`] = '-'; continue }
        const metaVal = metaHistAgg[i - 1]
        diffAgg[`s${i}`] = (currentWeek >= i && metaVal != null && metaVal !== '-') ? (aggVW[i - 1] || 0) - Number(metaVal) : '-'
      }

      const atingAgg = { label: 'Atingimento Realizado (%) vs Meta' }
      atingAgg.netSalesMes = aggMeta ? fmtPct(aggVT / aggMeta) : '-'
      for (let i = 1; i <= 5; i++) {
        if (!weekInMonth(i)) { atingAgg[`s${i}`] = '-'; continue }
        const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1)
        atingAgg[`s${i}`] = ((metaAgg[`s${i}`] || 0) > 0 && (currentWeek >= i || weekClosed))
          ? fmtPct((aggVW[i - 1] || 0) / metaAgg[`s${i}`]) : '-'
      }

      const assertAgg = { label: 'Assertividade do forecast' }
      assertAgg.netSalesMes = (aggMeta && currentWeek >= maxWeekAgg) ? fmtPct(aggVT / aggMeta) : '-'
      for (let i = 1; i <= 5; i++) {
        if (!weekInMonth(i)) { assertAgg[`s${i}`] = '-'; continue }
        const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1) || (currentWeek > i)
        assertAgg[`s${i}`] = ((weekClosed || currentWeek >= i) && (metaAgg[`s${i}`] || 0) > 0)
          ? fmtPct((aggVW[i - 1] || 0) / metaAgg[`s${i}`]) : '-'
      }

      const forecastVsSemanaAgg = { label: 'Forecast vs Semana' }
      forecastVsSemanaAgg.netSalesMes = (forecast75Agg.netSalesMes > 0 && (metaMaisDiffAgg.netSalesMes || 0) > 0)
        ? fmtPct(forecast75Agg.netSalesMes / (metaMaisDiffAgg.netSalesMes || 1))
        : '-'
      for (let i = 1; i <= 5; i++) {
        if (!weekInMonth(i)) { forecastVsSemanaAgg[`s${i}`] = '-'; continue }
        const metaVal = metaHistAgg[i - 1]
        const forecastVal = forecast75Agg[`s${i}`]
        forecastVsSemanaAgg[`s${i}`] = (metaVal != null && metaVal !== '-'
          && forecastVal != null && forecastVal !== '-'
          && Number(metaVal) > 0)
          ? fmtPct(Number(forecastVal) / Number(metaVal))
          : '-'
      }

      const rfAgg = { label: 'Realizado + Forecast' }
      let rfSum = 0
      for (let i = 1; i <= 5; i++) {
        if (!weekInMonth(i)) { rfAgg[`s${i}`] = '-'; continue }
        const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1) || (currentWeek > i)
        const v = weekClosed ? (aggVW[i - 1] || 0) : (aggF75W[i - 1] || 0)
        rfAgg[`s${i}`] = v; rfSum += v
      }
      rfAgg.netSalesMes = rfSum

      return [atingAgg, vendasAgg, diffAgg, metaAgg, metaMaisDiffAgg, assertAgg, forecastVsSemanaAgg, forecast75Agg, funilAgg, rfAgg]
    }

    // ── Modo individual: assessor selecionado ──
    const almostEqual = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.001

    const sumS = (key) => clientes.reduce((acc, c) => acc + parseNum(c[key]), 0)
    const sumS1 = sumS('s1'), sumS2 = sumS('s2'), sumS3 = sumS('s3'), sumS4 = sumS('s4'), sumS5 = sumS('s5')
    const sumForecast = clientes.reduce((acc, c) => acc + (Number(c.forecastMesNum) || 0), 0)

    const maxWeek = workdays.length ? Math.max(...workdays.map(w => Number(w.WeekOfMonth || 0))) : 4

    const getShare = (i) => {
      const candidates = [`S${i}`, `s${i}`, String(i)]
      for (const k of candidates) {
        if (Object.prototype.hasOwnProperty.call(targetWeeksMap, k)) return Number(targetWeeksMap[k]) || 0
      }
      return hasAnyWeekTarget || i > maxWeek ? 0 : 1 / maxWeek
    }

    const metaSemanal = targetTotal != null
      ? {
          label: 'Meta Semanal', netSalesMes: Number(targetTotal) || 0,
          s1: hasAnyWeekTarget && !weekHasTarget(1) ? '-' : targetTotal * getShare(1),
          s2: hasAnyWeekTarget && !weekHasTarget(2) ? '-' : targetTotal * getShare(2),
          s3: hasAnyWeekTarget && !weekHasTarget(3) ? '-' : targetTotal * getShare(3),
          s4: hasAnyWeekTarget && !weekHasTarget(4) ? '-' : targetTotal * getShare(4),
          s5: hasAnyWeekTarget && !weekHasTarget(5) ? '-' : targetTotal * getShare(5),
        }
      : { label: 'Meta Semanal', netSalesMes: sumForecast, s1: sumS1, s2: sumS2, s3: sumS3, s4: sumS4, s5: sumS5 }

    const sumsFor = filter => ({
      netSalesMes: clientes.reduce((acc, c) => acc + (filter(c) ? (Number(c.forecastMesNum) || 0) : 0), 0),
      s1: clientes.reduce((acc, c) => acc + (filter(c) ? parseNum(c.s1) : 0), 0),
      s2: clientes.reduce((acc, c) => acc + (filter(c) ? parseNum(c.s2) : 0), 0),
      s3: clientes.reduce((acc, c) => acc + (filter(c) ? parseNum(c.s3) : 0), 0),
      s4: clientes.reduce((acc, c) => acc + (filter(c) ? parseNum(c.s4) : 0), 0),
      s5: clientes.reduce((acc, c) => acc + (filter(c) ? parseNum(c.s5) : 0), 0),
    })

    const filter75 = c => { const p = parsePct(c.pct); return p != null && (almostEqual(p, 0.75) || almostEqual(p, 1)) }
    const filter25 = c => { const p = parsePct(c.pct); return p != null && almostEqual(p, 0.25) }
    const filter50 = c => { const p = parsePct(c.pct); return p != null && almostEqual(p, 0.5) }

    const forecast75    = { label: 'Forecast Preenchido (75%)', ...sumsFor(filter75) }
    forecast75.netSalesMes = [1,2,3,4,5]
      .filter(i => !currentWeek || i >= currentWeek)
      .reduce((acc, i) => acc + (Number(forecast75[`s${i}`]) || 0), 0)
    const forecast75TotalLive = [1,2,3,4,5].reduce((acc, i) => acc + (Number(forecast75[`s${i}`]) || 0), 0)

    const funilCombined = { label: 'Funil (25% e 50%)', ...sumsFor(c => filter25(c) || filter50(c)) }
    funilCombined.netSalesMes = [1,2,3,4,5]
      .filter(i => !currentWeek || i >= currentWeek)
      .reduce((acc, i) => acc + (Number(funilCombined[`s${i}`]) || 0), 0)

    const vendasTotal = vendas.reduce((acc, v) => acc + (Number(v.NetSales) || 0), 0)
    const vendasWeekSums = [0, 0, 0, 0, 0]
    vendas.forEach(v => {
      const w = Number(v.WeekOfMonth) || 0
      if (w >= 1 && w <= 5) vendasWeekSums[w - 1] += Number(v.NetSales) || 0
    })
    const vendasRow = {
      label: 'Vendas realizadas',
      netSalesMes: vendasTotal === 0 ? '-' : vendasTotal,
      s1: vendasWeekSums[0] === 0 ? '-' : vendasWeekSums[0],
      s2: vendasWeekSums[1] === 0 ? '-' : vendasWeekSums[1],
      s3: vendasWeekSums[2] === 0 ? '-' : vendasWeekSums[2],
      s4: vendasWeekSums[3] === 0 ? '-' : vendasWeekSums[3],
      s5: vendasWeekSums[4] === 0 ? '-' : vendasWeekSums[4],
    }

    const metaBase = [1, 2, 3, 4, 5].map(i => i <= maxWeek ? metaSemanal[`s${i}`] : '-')
    const pesos = targetTotal == null
      ? metaBase.map(valor => valor === '-' ? 0 : Math.max(0, Number(valor) || 0))
      : [1, 2, 3, 4, 5].map(i => getShare(i))
    const metaAjustadaHistorica = redistribuirMetaSemanal(metaBase, vendasWeekSums, currentWeek, pesos, maxWeek)
    const metaConciliada = conciliarMetaSemanal(metaAjustadaHistorica, vendasWeekSums, currentWeek)

    const metaMaisDiffRow = { label: 'Realizado + meta a realizar', netSalesMes: metaSemanal.netSalesMes || 0 }
    metaConciliada.forEach((valor, index) => { metaMaisDiffRow[`s${index + 1}`] = valor })

    const diffRow = { label: 'Diferença para o atingimento da meta', highlight: true }
    diffRow.netSalesMes = (vendasTotal || 0) - (metaMaisDiffRow.netSalesMes || 0)
    for (let i = 1; i <= 5; i++) {
      const metaVal = metaAjustadaHistorica[i - 1]
      diffRow[`s${i}`] = (currentWeek >= i && metaVal != null && metaVal !== '-') ? (vendasWeekSums[i - 1] || 0) - Number(metaVal) : '-'
    }

    const atingimentoRow = { label: 'Atingimento Realizado (%) vs Meta', highlight: false }
    atingimentoRow.netSalesMes = metaSemanal.netSalesMes ? fmtPct((vendasTotal || 0) / metaSemanal.netSalesMes) : '-'
    for (let i = 1; i <= 5; i++) {
      const vendasWeek = vendasWeekSums[i - 1] || 0
      const metaWeek = metaSemanal[`s${i}`] || 0
      const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1)
      atingimentoRow[`s${i}`] = (metaWeek > 0 && (currentWeek >= i || weekClosed)) ? fmtPct(vendasWeek / metaWeek) : '-'
    }

    const assertividadeRow = { label: 'Assertividade do forecast', highlight: false }
    assertividadeRow.netSalesMes = (metaSemanal.netSalesMes && currentWeek >= maxWeek)
      ? fmtPct((vendasTotal || 0) / (metaSemanal.netSalesMes || 1)) : '-'
    for (let i = 1; i <= 5; i++) {
      const vendasWeek = vendasWeekSums[i - 1] || 0
      const metaWeek = metaSemanal[`s${i}`] || 0
      const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1) || (currentWeek > i)
      assertividadeRow[`s${i}`] = ((weekClosed || currentWeek >= i) && metaWeek > 0) ? fmtPct(vendasWeek / metaWeek) : '-'
    }

    const forecastVsSemanaRow = { label: 'Forecast vs Semana', highlight: false }
    forecastVsSemanaRow.netSalesMes = (forecast75.netSalesMes > 0 && (metaMaisDiffRow.netSalesMes || 0) > 0)
      ? fmtPct(forecast75.netSalesMes / (metaMaisDiffRow.netSalesMes || 1))
      : '-'
    for (let i = 1; i <= 5; i++) {
      const metaVal = metaAjustadaHistorica[i - 1]
      const forecastVal = forecast75[`s${i}`]
      forecastVsSemanaRow[`s${i}`] = (metaVal != null && metaVal !== '-'
        && forecastVal != null && forecastVal !== '-'
        && Number(metaVal) > 0)
        ? fmtPct(Number(forecastVal) / Number(metaVal))
        : '-'
    }

    const realizadoForecastRow = { label: 'Realizado + Forecast', highlight: false }
    let realizadoForecastSum = 0
    for (let i = 1; i <= 5; i++) {
      const weekClosed = workdays.some(w => Number(w.WeekOfMonth) === i && Number(w.Closed) === 1) || (currentWeek > i)
      const chosen = weekClosed ? (vendasWeekSums[i - 1] || 0) : (forecast75[`s${i}`] || 0)
      realizadoForecastRow[`s${i}`] = chosen
      realizadoForecastSum += Number(chosen) || 0
    }
    realizadoForecastRow.netSalesMes = realizadoForecastSum

    return [atingimentoRow, vendasRow, diffRow, metaSemanal, metaMaisDiffRow, assertividadeRow, forecastVsSemanaRow, forecast75, funilCombined, realizadoForecastRow]
  }, [clientes, vendas, workdays, currentWeek, targetTotal, targetWeeksMap, isGestor, assessorSel, resumoAssessores])

  return { computedIndicators, currentWeek }
}
