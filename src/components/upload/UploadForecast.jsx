import React, { useRef, useState } from 'react'
import '../../App.css'
import { API_BASE } from '../../api/client'

export default function UploadForecast({ onClose }) {
  const [targetFile, setTargetFile] = useState(null)
  const [clientesFile, setClientesFile] = useState(null)
  const [stbrFile, setStbrFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragActiveTarget, setDragActiveTarget] = useState(false)
  const [dragActiveClientes, setDragActiveClientes] = useState(false)
  const [dragActiveStbr, setDragActiveStbr] = useState(false)
  const targetInputRef = useRef()
  const clientesInputRef = useRef()
  const stbrInputRef = useRef()

  function handleDrop(e, setFile, setDragActive) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  function handleDrag(e, setDragActive) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  function handleFileChange(e, setFile) {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  async function uploadSingle(file, url) {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await fetch(`${API_BASE}${url}`, { method: 'POST', body: fd, credentials: 'include' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    return res.json().catch(() => ({}))
  }

  async function handleSubmit() {
    if (!targetFile && !clientesFile && !stbrFile) return
    setSubmitting(true)
    try {
      if (targetFile)   await uploadSingle(targetFile,   '/api/forecast/target/upload-file')
      if (clientesFile) await uploadSingle(clientesFile, '/api/forecast/upload-file?marca=neodent')
      if (stbrFile)     await uploadSingle(stbrFile,     '/api/forecast/upload-file?marca=straumann')
      alert('Upload concluído com sucesso.')
      onClose && onClose()
    } catch (err) {
      console.error('Upload error', err)
      alert('Erro ao enviar arquivos: ' + (err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay upload-overlay">
      <div className="modal-raioX upload-modal">
        <div className="modal-raioX-title">
          Upload Forecast Mensal
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-raioX-body upload-body">
          {/* Target Excel */}
          <div className="upload-block">
            <div className="upload-block-title">Target (Excel)</div>
            <div
              className={`upload-dropzone${dragActiveTarget ? ' drag-active' : ''}`}
              onDragEnter={e => handleDrag(e, setDragActiveTarget)}
              onDragOver={e => handleDrag(e, setDragActiveTarget)}
              onDragLeave={e => handleDrag(e, setDragActiveTarget)}
              onDrop={e => handleDrop(e, setTargetFile, setDragActiveTarget)}
              onClick={() => targetInputRef.current && targetInputRef.current.click()}
            >
              {targetFile
                ? <span className="upload-file-name">{targetFile.name}</span>
                : <span className="upload-placeholder">Arraste o arquivo aqui ou clique para selecionar</span>}
              <input ref={targetInputRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFileChange(e, setTargetFile)} />
            </div>
          </div>
          {/* Forecast Neodent */}
          <div className="upload-block">
            <div className="upload-block-title">Forecast Neodent (Excel)</div>
            <div
              className={`upload-dropzone${dragActiveClientes ? ' drag-active' : ''}`}
              onDragEnter={e => handleDrag(e, setDragActiveClientes)}
              onDragOver={e => handleDrag(e, setDragActiveClientes)}
              onDragLeave={e => handleDrag(e, setDragActiveClientes)}
              onDrop={e => handleDrop(e, setClientesFile, setDragActiveClientes)}
              onClick={() => clientesInputRef.current && clientesInputRef.current.click()}
            >
              {clientesFile
                ? <span className="upload-file-name">{clientesFile.name}</span>
                : <span className="upload-placeholder">Arraste o arquivo aqui ou clique para selecionar</span>}
              <input ref={clientesInputRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFileChange(e, setClientesFile)} />
            </div>
          </div>
          {/* Forecast Straumann */}
          <div className="upload-block">
            <div className="upload-block-title">Forecast Straumann (Excel)</div>
            <div
              className={`upload-dropzone${dragActiveStbr ? ' drag-active' : ''}`}
              onDragEnter={e => handleDrag(e, setDragActiveStbr)}
              onDragOver={e => handleDrag(e, setDragActiveStbr)}
              onDragLeave={e => handleDrag(e, setDragActiveStbr)}
              onDrop={e => handleDrop(e, setStbrFile, setDragActiveStbr)}
              onClick={() => stbrInputRef.current && stbrInputRef.current.click()}
            >
              {stbrFile
                ? <span className="upload-file-name">{stbrFile.name}</span>
                : <span className="upload-placeholder">Arraste o arquivo aqui ou clique para selecionar</span>}
              <input ref={stbrInputRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFileChange(e, setStbrFile)} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || (!targetFile && !clientesFile && !stbrFile)}
          >
            {submitting ? 'Enviando...' : 'Submeter arquivos'}
          </button>
        </div>
      </div>
    </div>
  )
}
