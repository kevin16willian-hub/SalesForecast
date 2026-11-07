import React from 'react'
import './App.css'

import useAuth          from './hooks/useAuth'
import useUserProfile   from './hooks/useUserProfile'
import useForecastData  from './hooks/useForecastData'
import useIndicators    from './hooks/useIndicators'

import Login                  from './components/auth/Login'
import SessaoExpiradaModal    from './components/auth/SessaoExpiradaModal'
import AssessorSearch         from './components/common/AssessorSearch'
import Indicadores            from './components/forecast/Indicadores'
import ResumoAssessores       from './components/forecast/ResumoAssessores'
import TabelaClientes         from './components/forecast/TabelaClientes'
import ModalRegistrarForecast from './components/forecast/ModalRegistrarForecast'
import NovosClientes          from './components/clientes/NovosClientes'
import UploadForecast         from './components/upload/UploadForecast'

export default function App() {
  const {
    authChecked, isAuthenticated, userEmail, sessaoExpirada,
    handleLogin, handleLogout, handleSessaoExpiradaClose,
  } = useAuth()

  const { userCamada, isAssessorLocked, isGestor } = useUserProfile(isAuthenticated)

  const {
    clientes, selected, setSelected,
    assessoresList, assessorSel, setAssessorSel,
    vendas, workdays, targetTotal, targetWeeksMap,
    dirtyRows, resumoAssessores, resumoLoading, workdaysLoading, submittingForecast, error,
    isLoading, isDataReady,
    modalIncluirOpen, setModalIncluirOpen,
    modalUploadOpen,  setModalUploadOpen,
    modalRegistrarOpen, setModalRegistrarOpen,
    handleFieldChange, apagarLinhas, registrarForecast,
    handleConfirmarForecast, handleAdicionarDoModal,
    incluirCliente, handleRefresh,
  } = useForecastData(isAuthenticated, isGestor, isAssessorLocked)

  const { computedIndicators, currentWeek } = useIndicators({
    clientes, vendas, workdays, targetTotal, targetWeeksMap,
    isGestor, assessorSel, resumoAssessores,
  })

  const maxWeek = workdays.length ? Math.max(...workdays.map(w => Number(w.WeekOfMonth || 0))) : 5

  const showSpinnerForCoord = userCamada?.categoria === 'Coord' && !assessorSel && (resumoLoading || workdaysLoading)

  if (sessaoExpirada)   return <SessaoExpiradaModal onContinuar={handleSessaoExpiradaClose} />
  if (!authChecked)     return <div className="auth-loading">⏳ Verificando sessão...</div>
  if (!isAuthenticated) return <Login onLogin={handleLogin} />

  return (
    <div className="app-wrapper">
      {/* Header */}
      <div className="header">
        <div className="brand">
          <span className="brand-title"><span>Forecast - Preenchimento Semanal</span></span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="user-email-label">
            {userEmail
              ? `Boas-vindas, ${userEmail.split('@')[0].replace(/\d+$/, '').replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())}!`
              : ''}
          </span>
          <button className="btn btn-secondary" onClick={handleLogout}>↩ Sair</button>
        </div>
      </div>

      {/* Controls + Indicadores */}
      <div className="indicadores-row">
        <div className="indicadores-controls">
          <div className="buttons-group">
            <button
              className={`btn btn-primary${dirtyRows.size > 0 ? ' btn-dirty' : ''}`}
              onClick={registrarForecast}
            >
              ☁ Registrar Forecast{dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}
            </button>
            <button className="btn btn-secondary" onClick={handleRefresh}>↻ Atualizar</button>
            <button className="btn btn-danger" onClick={apagarLinhas} disabled={selected.length === 0}>
              🗑 Apagar Linhas Selecionadas {selected.length > 0 && `(${selected.length})`}
            </button>
            <button className="btn btn-success" onClick={incluirCliente} disabled={!assessorSel}>
              ＋ Incluir Clientes
            </button>
            {userCamada?.role === 'admin' && (
              <button
                className="btn btn-secondary"
                onClick={() => setModalUploadOpen(true)}
                style={{ marginLeft: 6 }}
              >
                ↑ Upload Forecast Mensal
              </button>
            )}
          </div>
          <div className="assessor-box" style={{ marginTop: 8 }}>
            <label>Assessor(a):</label>
            <AssessorSearch
              options={assessoresList}
              value={assessorSel}
              onConfirm={setAssessorSel}
              disabled={isAssessorLocked}
            />
          </div>
        </div>
        {(isDataReady || (isGestor && !assessorSel && resumoAssessores.length > 0)) && (
          <Indicadores indicadores={computedIndicators} currentWeek={currentWeek} />
        )}
      </div>

      {/* Tabela de Clientes */}
      {(isLoading || showSpinnerForCoord) && (
        <div className="spinner-overlay">
          <div className="spinner-ring" />
          <div className="spinner-label">Carregando dados...</div>
        </div>
      )}
      {error && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#c00', fontWeight: 600 }}>
          ⚠ {error}
        </div>
      )}
      {isDataReady && !error && (
        <TabelaClientes
          clientes={clientes}
          selected={selected}
          setSelected={setSelected}
          currentWeek={currentWeek}
          maxWeek={maxWeek}
          dirtyRows={dirtyRows}
          onFieldChange={handleFieldChange}
        />
      )}

      {/* Indicadores por Assessor */}
      {isGestor && !assessorSel && resumoAssessores.length > 0 && (
        <ResumoAssessores resumo={resumoAssessores} workdays={workdays} />
      )}

      {/* Modais */}
      {modalRegistrarOpen && (
        <ModalRegistrarForecast
          linhas={clientes.filter(c => dirtyRows.has(c.id))}
          onClose={() => !submittingForecast && setModalRegistrarOpen(false)}
          onConfirmar={handleConfirmarForecast}
          submitting={submittingForecast}
        />
      )}
      {modalIncluirOpen && (
        <NovosClientes
          assessorNome={assessorSel}
          onClose={() => setModalIncluirOpen(false)}
          onAdicionar={handleAdicionarDoModal}
        />
      )}
      {modalUploadOpen && (
        <UploadForecast onClose={() => setModalUploadOpen(false)} />
      )}
    </div>
  )
}
