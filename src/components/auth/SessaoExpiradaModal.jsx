import React from 'react'

export default function SessaoExpiradaModal({ onContinuar }) {
  return (
    <div className="modal-overlay modal-overlay-sessao">
      <div className="modal-expirada">
        <h2>Sua sessão expirou</h2>
        <p>Por favor, entre novamente com sua conta Microsoft para continuar.</p>
        <button className="btn btn-primary" onClick={onContinuar}>Entrar com Microsoft</button>
      </div>
    </div>
  )
}
