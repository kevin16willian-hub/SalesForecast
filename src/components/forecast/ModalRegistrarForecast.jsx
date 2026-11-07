import React from 'react'

export default function ModalRegistrarForecast({ linhas, onClose, onConfirmar, submitting }) {
  function handleOverlayClick(e) { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-raioX">
        <div className="modal-raioX-title">
          Confirmar Registro de Forecast
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-raioX-body">
          <p style={{ marginBottom: 8, color: '#555', fontSize: 13 }}>
            As seguintes linhas editadas serão registradas no banco de dados:
          </p>
          <div className="modal-clientes-list" style={{ maxHeight: 320 }}>
            {linhas.map(c => (
              <div key={c.id} className="modal-cliente-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span className="modal-cliente-org">{c.org}</span>
                  <span className="modal-cliente-nome">{c.nome}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#666', flexWrap: 'wrap' }}>
                  {['s1','s2','s3','s4','s5'].map(s => c[s] !== '' && c[s] != null && (
                    <span key={s}>{s.toUpperCase()}: {c[s]}</span>
                  ))}
                  {c.pct && <span>% Conv: {c.pct}</span>}
                  {c.Obs && <span>Obs: {c.Obs}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-footer" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={onConfirmar}
              disabled={submitting}
              style={{ marginLeft: 8 }}
            >
              {submitting ? 'Registrando...' : `Confirmar (${linhas.length} linha${linhas.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
