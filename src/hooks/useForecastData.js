import { useState, useEffect } from 'react'
import { API_BASE, apiFetch } from '../api/client'
import { parseGrupoFromAssessor } from '../utils/forecast'
import { formatNow, formatAnoMes, decimalToPctStr, parseNum, parsePct } from '../utils/format'

export default function useForecastData(isAuthenticated, isGestor, isAssessorLocked) {
  const [clientes, setClientes]         = useState([])
  const [selected, setSelected]         = useState([])
  const [assessoresList, setAssessoresList] = useState([])
  const [assessorSel, setAssessorSel]   = useState('')
  const [vendas, setVendas]             = useState([])
  const [workdays, setWorkdays]         = useState([])
  const [targetTotal, setTargetTotal]   = useState(null)
  const [targetWeeksMap, setTargetWeeksMap] = useState({})
  const [loadingCount, setLoadingCount] = useState(0)
  const [fetchedAssessor, setFetchedAssessor] = useState(null)
  const [error, setError]               = useState(null)
  const [lastUpdate, setLastUpdate]     = useState('-')
  const [lastAnoMes, setLastAnoMes]     = useState('-')
  const [dirtyRows, setDirtyRows]       = useState(new Set())
  const [refreshKey, setRefreshKey]     = useState(0)
  const [resumoAssessores, setResumoAssessores] = useState([])
  const [resumoLoading, setResumoLoading] = useState(false)
  const [workdaysLoading, setWorkdaysLoading] = useState(false)
  const [submittingForecast, setSubmittingForecast] = useState(false)
  const [modalIncluirOpen, setModalIncluirOpen] = useState(false)
  const [modalUploadOpen, setModalUploadOpen]   = useState(false)
  const [modalRegistrarOpen, setModalRegistrarOpen] = useState(false)

  // Reset state when logged out
  useEffect(() => {
    if (!isAuthenticated) {
      setClientes([])
      setSelected([])
      setAssessoresList([])
      setAssessorSel('')
      setVendas([])
      setWorkdays([])
      setTargetTotal(null)
      setTargetWeeksMap({})
      setDirtyRows(new Set())
      setResumoAssessores([])
    }
  }, [isAuthenticated])

  // Resumo por assessor (Coord/Gerente sem assessor selecionado)
  useEffect(() => {
    if (!isAuthenticated || !isGestor) { setResumoAssessores([]); setResumoLoading(false); return }
    setResumoLoading(true)
    apiFetch(`${API_BASE}/api/forecast/resumo-assessores`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setResumoAssessores(Array.isArray(data) ? data : []))
      .catch(() => setResumoAssessores([]))
      .finally(() => setResumoLoading(false))
  }, [isAuthenticated, isGestor, refreshKey])

  // Carrega lista de assessores
  useEffect(() => {
    if (!isAuthenticated) return
    apiFetch(`${API_BASE}/api/buscarassessores`)
      .then(res => { if (!res.ok) throw new Error(`Erro HTTP ${res.status}`); return res.json() })
      .then(data => {
        const list = (data.map(d => d.NomeSistemaGrupoRegID).filter(Boolean) || [])
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        setAssessoresList(list)
      })
      .catch(err => console.warn('Não foi possível carregar assessores:', err.message))
  }, [refreshKey, isAuthenticated])

  // Auto-seleciona assessor quando é SalesRep
  useEffect(() => {
    if (isAssessorLocked && assessoresList.length > 0) {
      setAssessorSel(assessoresList[0])
    }
  }, [isAssessorLocked, assessoresList])

  // Busca clientes do banco
  useEffect(() => {
    if (!isAuthenticated || !assessorSel) return
    const currentAssessor = assessorSel
    setLoadingCount(c => c + 1)
    const grupo = parseGrupoFromAssessor(assessorSel)
    apiFetch(`${API_BASE}/api/forecast/all?grupoRegID=${grupo}`)
      .then(res => { if (!res.ok) throw new Error(`Erro HTTP ${res.status}`); return res.json() })
      .then(data => {
        const converted = data.map(item => ({
          id: item.Lin ?? 0,
          org: item.Organization ?? '',
          nome: item.NomeCliente ?? '',
          ultimaVisita: item.UltimaVisitaPresencial ?? '-',
          proxVisita: item.ProximaVisitaPresencial ?? '-',
          classificacao: item.Classificacao ?? '',
          bloco: item.Bloco ?? '',
          actualNS: item.ActualNetSales ?? '',
          forecastMesNum: item.ForecastNetSalesMes ?? 0,
          forecastMes: item.ForecastNetSalesMes != null ? String(item.ForecastNetSalesMes) : '',
          codLin: item.CodLin ?? '',
          s1: item.S1 ?? '', s2: item.S2 ?? '', s3: item.S3 ?? '',
          s4: item.S4 ?? '', s5: item.S5 ?? '',
          pct: decimalToPctStr(item.PercentualConversao),
          Obs: item.Tipo ?? '',
        }))
        converted.sort((a, b) => (b.forecastMesNum || 0) - (a.forecastMesNum || 0))
        const final = converted.map((c, i) => ({ ...c, id: i + 1 }))
        setClientes(final)
        setDirtyRows(new Set())
        setFetchedAssessor(currentAssessor)
        setLoadingCount(c => c - 1)
        try { setLastUpdate(formatNow()); setLastAnoMes(formatAnoMes()) } catch (_) {}
      })
      .catch(err => {
        console.error(err)
        setError('Não foi possível carregar os clientes. Verifique se o servidor está rodando.')
        setFetchedAssessor(currentAssessor)
        setLoadingCount(c => c - 1)
      })
  }, [refreshKey, isAuthenticated, assessorSel])

  // Busca vendas do mês atual
  useEffect(() => {
    if (!isAuthenticated || !assessorSel) return
    const grupo = parseGrupoFromAssessor(assessorSel)
    setLoadingCount(c => c + 1)
    apiFetch(`${API_BASE}/api/vendas-mes-atual?grupoRegID=${grupo}`)
      .then(res => { if (!res.ok) throw new Error(`Erro HTTP ${res.status}`); return res.json() })
      .then(data => { setVendas(Array.isArray(data) ? data : []); setLoadingCount(c => c - 1) })
      .catch(err => { console.warn('Não foi possível carregar vendas:', err.message); setVendas([]); setLoadingCount(c => c - 1) })
  }, [refreshKey, isAuthenticated, assessorSel])

  // Busca workdays
  useEffect(() => {
    if (!isAuthenticated) { setWorkdays([]); setWorkdaysLoading(false); return }
    setWorkdaysLoading(true)
    setLoadingCount(c => c + 1)
    apiFetch(`${API_BASE}/api/workdays`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => { setWorkdays(Array.isArray(data) ? data : []); })
      .catch(err => { console.warn('Não foi possível carregar workdays:', err); setWorkdays([]); })
      .finally(() => { setLoadingCount(c => c - 1); setWorkdaysLoading(false) })
  }, [refreshKey, isAuthenticated])

  // Busca target total e distribuição por semanas
  useEffect(() => {
    if (!isAuthenticated || !assessorSel) return
    const grupo = parseGrupoFromAssessor(assessorSel)
    setLoadingCount(c => c + 1)
    apiFetch(`${API_BASE}/api/forecast/target?grupoRegID=${grupo}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => {
        const t = Array.isArray(data) && data.length ? data[0].Target : null
        setTargetTotal(t != null ? Number(t) : null)
        setLoadingCount(c => c - 1)
      })
      .catch(() => { setTargetTotal(null); setLoadingCount(c => c - 1) })

    setLoadingCount(c => c + 1)
    apiFetch(`${API_BASE}/api/forecast/target-semanas?grupoRegID=${grupo}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => {
        const map = {}
        ;(Array.isArray(data) ? data : []).forEach(r => {
          if (r && r.TipoFc) map[String(r.TipoFc).toUpperCase()] = Number(r.Target) || 0
        })
        setTargetWeeksMap(map)
        setLoadingCount(c => c - 1)
      })
      .catch(() => { setTargetWeeksMap({}); setLoadingCount(c => c - 1) })
  }, [refreshKey, isAuthenticated, assessorSel])

  const isLoading  = !!assessorSel && (loadingCount > 0 || fetchedAssessor !== assessorSel)
  const isDataReady = !!assessorSel && loadingCount === 0 && fetchedAssessor === assessorSel

  function handleFieldChange(id, field, value) {
    setClientes(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
    setDirtyRows(prev => { const n = new Set(prev); n.add(id); return n })
  }

  function apagarLinhas() {
    if (selected.length === 0) return
    if (!window.confirm(`Apagar ${selected.length} linha(s) selecionada(s)?`)) return
    const orgs = clientes.filter(c => selected.includes(c.id)).map(c => String(c.org))
    const grupo = parseGrupoFromAssessor(assessorSel)

    async function enviarDeleteComRetry() {
      let lastError = null
      for (let tentativas = 0; tentativas < 2; tentativas += 1) {
        try {
          const res = await apiFetch(`${API_BASE}/api/forecast/inserir-del?grupoRegID=${grupo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Organizations: orgs }),
          })
          const body = await res.json().catch(() => null)
          if (res.ok && body && body.ok) return body
          if (res.status >= 500 && tentativas === 0) {
            lastError = new Error(body?.error || String(res.status))
            continue
          }
          throw new Error(body?.error || `HTTP ${res.status}`)
        } catch (err) {
          lastError = err
          if (tentativas === 0) continue
          throw lastError
        }
      }
      throw lastError || new Error('unknown_error')
    }

    enviarDeleteComRetry()
      .then(() => {
        setClientes(prev => prev.filter(c => !selected.includes(c.id)))
        setSelected([])
        setRefreshKey(k => k + 1)
        setDirtyRows(new Set())
        alert(`Solicitadas ${orgs.length} remoção(ões) no servidor.`)
      })
      .catch(err => { console.error(err); alert('Não foi possível confirmar a remoção no servidor. Recarregue a tela para verificar o estado final.') })
  }

  function registrarForecast() {
    if (dirtyRows.size === 0) return
    setModalRegistrarOpen(true)
  }

  async function handleConfirmarForecast() {
    const linhasEditadas = clientes.filter(c => dirtyRows.has(c.id))
    setSubmittingForecast(true)
    const erros = []

    async function registrarLinhaComRetry(c, grupo) {
      let lastError = null
      for (let tentativas = 0; tentativas < 2; tentativas += 1) {
        try {
          const res = await apiFetch(`${API_BASE}/api/forecast/inserir-add?grupoRegID=${grupo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              CodCliente: String(c.org),
              CodLin: c.codLin || undefined,
              Valor1: c.s1 !== '' && c.s1 != null ? parseNum(String(c.s1)) : null,
              Valor2: c.s2 !== '' && c.s2 != null ? parseNum(String(c.s2)) : null,
              Valor3: c.s3 !== '' && c.s3 != null ? parseNum(String(c.s3)) : null,
              Valor4: c.s4 !== '' && c.s4 != null ? parseNum(String(c.s4)) : null,
              Valor5: c.s5 !== '' && c.s5 != null ? parseNum(String(c.s5)) : null,
              Valor0: c.pct !== '' && c.pct != null ? parsePct(String(c.pct)) : null,
              Observacao: c.Obs || 'Visita',
            }),
          })
          if (res.ok) {
            return null
          }
          const body = await res.json().catch(() => ({}))
          if (res.status >= 500 && tentativas === 0) {
            lastError = new Error(body.error || String(res.status))
            continue
          }
          return `${c.nome || c.org}: ${body.error || res.status}`
        } catch (err) {
          lastError = err
          if (tentativas === 0) continue
          return `${c.nome || c.org}: ${lastError.message}`
        }
      }
      return `${c.nome || c.org}: ${lastError ? lastError.message : 'unknown_error'}`
    }

    for (const c of linhasEditadas) {
      const grupo = parseGrupoFromAssessor(assessorSel)
      const erro = await registrarLinhaComRetry(c, grupo)
      if (erro) erros.push(erro)
    }
    setSubmittingForecast(false)
    setModalRegistrarOpen(false)
    if (erros.length) {
      alert(`Erros ao registrar:\n${erros.join('\n')}`)
    } else {
      setDirtyRows(new Set())
      setRefreshKey(k => k + 1)
      alert(`${linhasEditadas.length} linha(s) registrada(s) com sucesso.`)
    }
  }

  function handleAdicionarDoModal(novosClientes) {
    const existeOrgs = new Set(clientes.map(c => String(c.org)))
    const para_add = novosClientes
      .filter(c => !existeOrgs.has(String(c.Organization)))
      .map((c, i) => ({
        id: clientes.length + i + 1,
        org: c.Organization, nome: c.Nome,
        ultimaVisita: '-', proxVisita: '-',
        classificacao: c.Classificacao || '',
        bloco: c.Bloco || '',
        actualNS: '', forecastMesNum: 0, forecastMes: '',
        s1: '', s2: '', s3: '', s4: '', s5: '',
        pct: '75%', Obs: 'Visita',
      }))
    if (para_add.length === 0) { alert('Todos os clientes selecionados já estão na tabela.'); return }
    setClientes(prev => [...prev, ...para_add].map((c, i) => ({ ...c, id: i + 1 })))
    setRefreshKey(k => k + 1)
    setDirtyRows(new Set())
  }

  function incluirCliente() {
    if (!assessorSel) { alert('Selecione um assessor antes de incluir clientes.'); return }
    setModalIncluirOpen(true)
  }

  function handleRefresh() {
    setRefreshKey(k => k + 1)
    setDirtyRows(new Set())
  }

  return {
    clientes, setClientes,
    selected, setSelected,
    assessoresList,
    assessorSel, setAssessorSel,
    vendas, workdays,
    targetTotal, targetWeeksMap,
    dirtyRows, refreshKey,
    resumoAssessores,
    resumoLoading, workdaysLoading,
    submittingForecast,
    error,
    lastUpdate, lastAnoMes,
    isLoading, isDataReady,
    modalIncluirOpen, setModalIncluirOpen,
    modalUploadOpen, setModalUploadOpen,
    modalRegistrarOpen, setModalRegistrarOpen,
    handleFieldChange,
    apagarLinhas,
    registrarForecast,
    handleConfirmarForecast,
    handleAdicionarDoModal,
    incluirCliente,
    handleRefresh,
  }
}
