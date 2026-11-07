import { useState, useEffect } from 'react'
import { API_BASE, apiFetch, setSessionExpiredCallback } from '../api/client'

export default function useAuth() {
  const [authChecked, setAuthChecked]       = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail]           = useState('')
  const [sessaoExpirada, setSessaoExpirada] = useState(false)

  useEffect(() => {
    setSessionExpiredCallback(() => setSessaoExpirada(true))
    return () => setSessionExpiredCallback(null)
  }, [])

  useEffect(() => {
    apiFetch(`${API_BASE}/api/me`)
      .then(r => r.json())
      .then(data => {
        setIsAuthenticated(data.authenticated === true)
        if (data.email) setUserEmail(data.email)
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthChecked(true))
  }, [])

  async function handleLogout() {
    setIsAuthenticated(false)
    setUserEmail('')
    setAuthChecked(false)
    window.location.assign(`${API_BASE}/api/auth/logout`)
  }

  function handleLogin(email) {
    setIsAuthenticated(true)
    setUserEmail(email)
  }

  function handleSessaoExpiradaClose() {
    setSessaoExpirada(false)
    setIsAuthenticated(false)
    setUserEmail('')
    setAuthChecked(true)
    window.location.assign(`${API_BASE}/api/auth/login/microsoft`)
  }

  return {
    authChecked,
    isAuthenticated,
    userEmail,
    sessaoExpirada,
    handleLogin,
    handleLogout,
    handleSessaoExpiradaClose,
  }
}
