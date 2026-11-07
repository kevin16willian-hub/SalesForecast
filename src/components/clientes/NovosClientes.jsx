import React, { useState, useEffect } from 'react'
import '../../App.css'
import { API_BASE, apiFetch } from '../../api/client'
import { parseGrupoFromAssessor } from '../../utils/forecast'

export default function NovosClientes({ assessorNome, onClose, onAdicionar }) {
  const [microClientes, setMicroClientes] = useState([])
  const [loadingModal, setLoadingModal]   = useState(true)
  const [filtro, setFiltro]               = useState('')
  const [filtrarPor, setFiltrarPor]       = useState('nome')   // 'nome' | 'codigo'
  const [ordenarPor, setOrdenarPor]       = useState('nome')   // 'nome' | 'codigo' | 'blocos'
  const [ordem, setOrdem]                 = useState('asc')    // 'asc'  | 'desc'
  const [selecionados, setSelecionados]   = useState([])
  const [submitting, setSubmitting]       = useState(false)

  useEffect(() => {
    setLoadingModal(true)
    const grupo = parseGrupoFromAssessor(assessorNome)
    apiFetch(`${API_BASE}/api/clientes-microregiao?grupoRegID=${grupo}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => { setMicroClientes(Array.isArray(data) ? data : []); setLoadingModal(false) })
      .catch(() => setLoadingModal(false))
  }, [assessorNome])

  function toggleSelect(org) {
    setSelecionados(prev => prev.includes(org) ? prev.filter(o => o !== org) : [...prev, org])
  }

  function limpar() { setFiltro(''); setSelecionados([]) }

  async function adicionarClienteComRetry(cliente, grupo) {
    let lastError = null
    for (let tentativas = 0; tentativas < 2; tentativas += 1) {
      try {
        const res = await apiFetch(`${API_BASE}/api/forecast/inserir-add?grupoRegID=${grupo}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ CodCliente: cliente.Organization })
        })
        const body = await res.json().catch(() => null)
        if (res.ok) {
          return { ok: true, status: res.status, body, client: cliente }
        }
        if (res.status >= 500 && tentativas === 0) {
          lastError = new Error(body?.error || String(res.status))
          continue
        }
        return { ok: false, status: res.status, body, client: cliente }
      } catch (err) {
        lastError = err
        if (tentativas === 0) continue
        return { ok: false, error: lastError.message, client: cliente }
      }
    }
    return { ok: false, error: lastError ? lastError.message : 'unknown_error', client: cliente }
  }

  const filtered = microClientes.filter(c => {
    if (!filtro.trim()) return true
    const q = filtro.trim().toLowerCase()
    return filtrarPor === 'nome'
      ? (c.Nome || '').toLowerCase().includes(q)
      : String(c.Organization).includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    const va = ordenarPor === 'nome'   ? (a.Nome || '')
             : ordenarPor === 'codigo' ? String(a.Organization)
             : (a.Classificacao || '')
    const vb = ordenarPor === 'nome'   ? (b.Nome || '')
             : ordenarPor === 'codigo' ? String(b.Organization)
             : (b.Classificacao || '')
    const cmp = va.localeCompare(vb, 'pt-BR')
    return ordem === 'asc' ? cmp : -cmp
  })

  async function handleAdicionar() {
    const toAdd = microClientes.filter(c => selecionados.includes(c.Organization))
    if (!toAdd.length) {
      alert('Nenhum cliente selecionado para adicionar.')
      return
    }
    setSubmitting(true)
    try {
      const grupo = parseGrupoFromAssessor(assessorNome)
      const promises = toAdd.map(c => adicionarClienteComRetry(c, grupo))
      const results = await Promise.all(promises)
      const succeeded = results.filter(r => r.ok).map(r => r.client)
      const failed = results.filter(r => !r.ok)
      if (succeeded.length) onAdicionar(succeeded)
      if (failed.length) {
        alert(`${failed.length} cliente(s) não puderam ser confirmados no servidor. Atualize a tela para conferir o estado final.`)
      } else {
        alert('Clientes adicionados com sucesso.')
      }
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  function handleOverlayClick(e) { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-raioX">
        <div className="modal-raioX-title">
          Seleção de Clientes do RaioX
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-raioX-body">
          <div className="modal-info-row">
            <div className="modal-info-box">
              <span className="modal-info-label">Consultor</span>
              <span className="modal-info-value">{assessorNome || '—'}</span>
            </div>
            <div className="modal-info-box">
              <span className="modal-info-label">GrupoReg</span>
              <span className="modal-info-value">{parseGrupoFromAssessor(assessorNome)}</span>
            </div>
            <div className="modal-info-group">
              <span className="modal-info-label">Ordenar por</span>
              <div className="modal-radio-group">
                {[['nome','Nome'],['codigo','Código'],['blocos','Blocos']].map(([v,l]) => (
                  <label key={v}>
                    <input type="radio" name="ordenarPor" value={v} checked={ordenarPor === v} onChange={() => setOrdenarPor(v)} />
                    {' '}{l}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-info-group">
              <span className="modal-info-label">Ordem</span>
              <div className="modal-radio-group">
                <label><input type="radio" name="ordem" value="asc"  checked={ordem === 'asc'}  onChange={() => setOrdem('asc')}  /> A-Z</label>
                <label><input type="radio" name="ordem" value="desc" checked={ordem === 'desc'} onChange={() => setOrdem('desc')} /> Z-A</label>
              </div>
            </div>
          </div>

          <div className="modal-filter-row">
            <span className="modal-info-label">Filtrar por</span>
            <label><input type="radio" name="filtrarPor" value="nome"   checked={filtrarPor === 'nome'}   onChange={() => setFiltrarPor('nome')} />  Nome</label>
            <label><input type="radio" name="filtrarPor" value="codigo" checked={filtrarPor === 'codigo'} onChange={() => setFiltrarPor('codigo')} /> Código</label>
            <input
              className="modal-filter-input"
              type="text"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar..."
            />
            <button className="btn btn-secondary modal-btn-limpar" onClick={limpar}>
              Limpar Filtro e Clientes Selecionados
            </button>
          </div>

          <div className="modal-clientes-label">Clientes</div>
          <div className="modal-clientes-list">
            {loadingModal && <div className="modal-loading">⏳ Carregando...</div>}
            {!loadingModal && sorted.length === 0 && (
              <div className="modal-loading">Nenhum cliente encontrado.</div>
            )}
            {!loadingModal && sorted.map(c => (
              <div
                key={c.Organization}
                className={`modal-cliente-row${selecionados.includes(c.Organization) ? ' selected' : ''}`}
                onClick={() => toggleSelect(c.Organization)}
              >
                <span className="modal-cliente-org">{c.Organization}</span>
                <span className="modal-cliente-nome">{c.Nome}</span>
                <span className="modal-cliente-class">{c.Classificacao || '-'}</span>
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <div className="modal-quantidade">
              <span className="modal-info-label">Quantidade</span>
              <span className="modal-quantidade-val">{selecionados.length}</span>
            </div>
            <button
              className="btn modal-btn-adicionar"
              onClick={handleAdicionar}
              disabled={selecionados.length === 0 || submitting}
            >
              {submitting ? 'Adicionando...' : 'Adicionar Clientes para Oportunidades'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
