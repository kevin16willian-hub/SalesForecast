import React, { useState, useEffect, useRef } from 'react'

export default function AssessorSearch({ options, value, onConfirm, disabled }) {
  const [inputVal, setInputVal] = useState(value || '')
  const [open, setOpen]         = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef                 = useRef(null)
  const inputRef                = useRef(null)

  useEffect(() => { setInputVal(value || '') }, [value])

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !inputVal.trim() || o.toLowerCase().includes(inputVal.trim().toLowerCase())
  )

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1)
      return
    }
    if (!filtered.length) {
      setActiveIndex(-1)
      return
    }
    setActiveIndex(idx => {
      if (idx < 0) return 0
      if (idx >= filtered.length) return filtered.length - 1
      return idx
    })
  }, [open, filtered.length])

  function handleChange(e) {
    const v = e.target.value
    setInputVal(v)
    setOpen(true)
    setActiveIndex(0)
    if (!v.trim()) onConfirm('')
  }

  function handleSelect(opt) {
    setInputVal(opt)
    setOpen(false)
    onConfirm(opt)
  }

  function handleKeyDown(e) {
    if (!open || !filtered.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(idx => (idx < 0 ? 0 : (idx + 1) % filtered.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(idx => (idx <= 0 ? filtered.length - 1 : idx - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex])
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  if (disabled) {
    return (
      <div className="assessor-search-wrap">
        <input
          className="assessor-select-input"
          type="text"
          value={value || ''}
          readOnly
          style={{ background: '#f0f0f0', cursor: 'default', color: '#444', fontWeight: 600 }}
        />
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="assessor-search-wrap">
      <input
        ref={inputRef}
        className="assessor-select-input"
        type="text"
        value={inputVal}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar assessor..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="assessor-dropdown">
          {filtered.map((o, idx) => (
            <div
              key={o}
              className={`assessor-dropdown-item${o === value || idx === activeIndex ? ' active' : ''}`}
              aria-selected={idx === activeIndex}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={e => { e.preventDefault(); handleSelect(o) }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
