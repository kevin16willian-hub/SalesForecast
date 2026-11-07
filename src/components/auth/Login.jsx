import React from 'react'
import '../../App.css'
import { API_BASE } from '../../api/client'

const showProductionLink = String(import.meta.env.REDIRECT_PROD || '').trim().toLowerCase() === 'true'
const productionUrl = 'https://salesforecast-neo.straumann.com/'

export default function Login() {
  const authError = new URLSearchParams(window.location.search).get('auth_error')

  function handleMicrosoftLogin() {
    window.location.assign(`${API_BASE}/api/auth/login/microsoft`)
  }

  function handleProductionAccess() {
    window.location.assign(productionUrl)
  }

  const errorText = authError === 'email_not_authorized'
    ? 'E-mail não autorizado para acessar o SalesForecast.'
    : authError === 'email_missing'
      ? 'E-mail não encontrado nas claims do Entra ID.'
      : null

  const titleText = showProductionLink ? '' : 'Acesso via Microsoft Entra ID'
  const copyText = showProductionLink
    ? 'Seu acesso será redirecionado para o ambiente de produção.'
    : 'Use sua conta corporativa Straumann para entrar. O fluxo será redirecionado ao Microsoft Entra ID.'
  const noteText = showProductionLink
    ? 'O acesso ao ambiente de QA está indisponível nesse momento.'
    : 'Se a sessão expirar, você será levado de volta para o login Microsoft.'

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div>
            <div className="login-title">SalesForecast</div>
            <div className="login-subtitle">{titleText}</div>
          </div>
        </div>

        <div className="login-form">
          <p className="login-sso-copy">{copyText}</p>

          {!showProductionLink && errorText && (
            <div className="login-message login-message-error">
              {errorText}
            </div>
          )}

          {showProductionLink ? (
            <button className="login-btn" type="button" onClick={handleProductionAccess}>
              Acessar produção
            </button>
          ) : (
            <button className="login-btn" type="button" onClick={handleMicrosoftLogin}>
              Entrar com Microsoft
            </button>
          )}

          <p className="login-sso-note">{noteText}</p>
        </div>
      </div>
    </div>
  )
}
