import { useState, useEffect } from 'react'
import { API_BASE, apiFetch } from '../api/client'

function applyBrandTheme(marca) {
  const root = document.documentElement
  if (marca && marca.toLowerCase() === 'straumann') {
    root.style.setProperty('--brand-primary',       '#195afa')
    root.style.setProperty('--brand-primary-rgb',   '25,90,250')
    root.style.setProperty('--brand-header-bg',     '#195afa')
    root.style.setProperty('--brand-header-darker', '#0f3fc7')
    root.style.setProperty('--brand-accent',        '#b98c3c')
    root.style.setProperty('--brand-hover-bg',      '#e8f0fe')
    root.style.setProperty('--brand-hover-color',   '#195afa')
    root.style.setProperty('--brand-row-even',      '#f0f4ff')
    root.style.setProperty('--brand-row-hover',     '#dce8ff')
    root.style.setProperty('--brand-focus-ring',    'rgba(25,90,250,0.2)')
  } else {
    root.style.setProperty('--brand-primary',       '#5d3472')
    root.style.setProperty('--brand-primary-rgb',   '93,52,114')
    root.style.setProperty('--brand-header-bg',     '#5d3472')
    root.style.setProperty('--brand-header-darker', '#7b2d8b')
    root.style.setProperty('--brand-accent',        '#843177')
    root.style.setProperty('--brand-hover-bg',      '#f3e8fa')
    root.style.setProperty('--brand-hover-color',   '#5d3472')
    root.style.setProperty('--brand-row-even',      '#faf6fd')
    root.style.setProperty('--brand-row-hover',     '#f0e6f5')
    root.style.setProperty('--brand-focus-ring',    'rgba(123,45,139,0.15)')
  }
}

export default function useUserProfile(isAuthenticated) {
  const [userCamada, setUserCamada] = useState(null)
  const [userMarca, setUserMarca]   = useState(null)

  useEffect(() => {
    if (!isAuthenticated) { setUserCamada(null); return }
    apiFetch(`${API_BASE}/api/camadas-usuario`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setUserCamada(Array.isArray(data) && data.length ? data[0] : null))
      .catch(() => setUserCamada(null))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) { setUserMarca(null); return }
    apiFetch(`${API_BASE}/api/marca-usuario`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const m = data && data.Marca ? data.Marca : null
        setUserMarca(m)
        applyBrandTheme(m)
      })
      .catch(() => setUserMarca(null))
  }, [isAuthenticated])

  const isAssessorLocked = !!(userCamada && userCamada.role === 'user' && userCamada.categoria === 'SalesRep')
  const isGestor = !!(userCamada && userCamada.role === 'user' &&
    (userCamada.categoria === 'Coord' || userCamada.categoria === 'Gerente'))

  return { userCamada, userMarca, isAssessorLocked, isGestor }
}
