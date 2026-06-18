import { useEffect, useRef, useState } from 'react'

// Splits a string containing <em>...</em> markers into React nodes,
// wrapping the emphasized words in a styled <mark> for light-blue highlight.
function renderHighlighted(text, keyPrefix) {
  const parts = []
  const regex = /<em>(.*?)<\/em>/gs
  let lastIndex = 0
  let match
  let i = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <mark className="hl" key={`${keyPrefix}-em-${i}`}>
        {match[1]}
      </mark>
    )
    lastIndex = regex.lastIndex
    i += 1
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

// Dropdown options for the Content Type filter.
const CONTENT_TYPE_OPTIONS = [
  'General',
  'Corporate Standards',
  'Alerts',
  'Bulletins',
  'Metering',
  'Pesticide',
  'General,Helicopters',
  'Stringing',
  'Metering DX Single Phase', 
  'Metering DX Three Phase',
  'DS Equipment',
  'Grounding and Bonding',
  'Safety Equipment and Practices',
  'Emergency Response Plans ERPs',
  'HSEMS Control Registry',
  'Safety Equipment and Practices',
  'Corporate Security',
  'Corporate Governance', 
  'Corporate Standards', 
  'Information Security and Disaster Recovery',
  'Metering DX Single Phase',
  'Protection and Control',
  'Transformers',
]

// Dropdown options for the Prefix filter.
const PREFIX_OPTIONS = ['AL', 'BU', 'FP', 'HO', 'PR', 'SP']

// Base URL for the downstream HODS API. Empty string keeps requests on the
// same origin so the Vite dev-server proxy can forward them to the backend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// A dropdown that lets the user check multiple options. Shows "All" when none
// are selected, otherwise a count. Closes when clicking outside.
function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((o) => o !== opt))
    else onChange([...selected, opt])
  }

  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`

  return (
    <div className="filter" ref={ref}>
      <span className="filter-label">{label}</span>
      <button
        type="button"
        className="filter-select multiselect-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="multiselect-summary">{summary}</span>
        <span className="multiselect-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="multiselect-menu" role="listbox">
          {options.map((opt) => (
            <label className="multiselect-option" key={opt}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="keyword-tags multiselect-chips">
          {selected.map((opt) => (
            <span className="keyword-tag" key={opt}>
              {opt}
              <button
                type="button"
                className="keyword-tag-remove"
                onClick={() => toggle(opt)}
                aria-label={`Remove ${opt}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const [term, setTerm] = useState('')
  const [keywords, setKeywords] = useState([])
  const [contentTypes, setContentTypes] = useState([])
  const [prefix, setPrefix] = useState('')
  const [results, setResults] = useState(null) // null = no search yet
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState(null)

  // Tracks the last text returned by the optimizer so we don't re-optimize it
  // when it gets written back into the textbox.
  const lastOptimizedRef = useRef('')
  // Monotonic id so only the most recent optimize call is allowed to win.
  const requestIdRef = useRef(0)
  // Holds the in-flight request controller so a newer call can abort it.
  const controllerRef = useRef(null)
  // Always reflects the latest textbox value so an in-flight optimize call can
  // tell whether the user has kept typing since it was sent.
  const latestTermRef = useRef('')

  // Debounced query optimization: a short pause after the user stops typing,
  // clean the query via /OptimizeHybridQueries, then write the optimized text
  // back into the textbox and populate the keywords structure.
  // - Runs asynchronously; the last call always wins (stale responses are
  //   ignored and any older in-flight call is aborted).
  // - Never overwrites the textbox/keywords if the user has typed since the
  //   call was sent.
  // - Any single call is killed if it takes longer than 5 seconds.
  useEffect(() => {
    latestTermRef.current = term
    const text = term.trim()
    if (!text || text === lastOptimizedRef.current) return

    const timer = setTimeout(() => {
      // Supersede any older in-flight request.
      requestIdRef.current += 1
      const requestId = requestIdRef.current
      controllerRef.current?.abort()

      const controller = new AbortController()
      controllerRef.current = controller
      // Kill this call if it runs longer than 5 seconds.
      const killTimer = setTimeout(() => controller.abort(), 5000)

      setOptimizing(true)
      fetch(`${API_BASE_URL}/OptimizeHybridQueries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Optimize failed (${res.status})`)
          const data = await res.json()
          // Last call wins: ignore results from superseded requests.
          if (requestId !== requestIdRef.current) return
          // Don't clobber the textbox/keywords if the user kept typing.
          if (latestTermRef.current.trim() !== text) return
          const optimized = data.OptimizedQuery ?? text
          lastOptimizedRef.current = optimized
          setTerm(optimized)
          setKeywords(Array.isArray(data.keywords) ? data.keywords : [])
        })
        .catch((err) => {
          // Ignore aborts (superseded or timed-out) and stale errors.
          if (err.name === 'AbortError') return
          if (requestId !== requestIdRef.current) return
          setError(err.message)
        })
        .finally(() => {
          clearTimeout(killTimer)
          if (requestId === requestIdRef.current) setOptimizing(false)
        })
    }, 1100)

    return () => clearTimeout(timer)
  }, [term])

  const handleSearch = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const filter = []
      contentTypes.forEach((ct) => filter.push({ key: 'contentType', value: ct }))
      if (prefix) filter.push({ key: 'prefix', value: prefix })

      const res = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: term,
          keywords,
          filter,
        }),
      })
      if (!res.ok) throw new Error(`Query failed (${res.status})`)
      const data = await res.json()
      setResults(data.value || [])
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          className="search-input"
          placeholder="Enter search terms…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search terms"
        />
        <button type="submit" className="search-button">
          Search
        </button>
      </form>

      {optimizing && (
        <p className="status optimizing">
          <span className="spinner" aria-hidden="true" />
          <span>Optimizing query</span>
          <span className="dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      )}
      {keywords.length > 0 && (
        <div className="keywords">
          <span className="field-label">Keywords</span>
          <div className="keyword-tags">
            {keywords.map((kw) => (
              <span className="keyword-tag" key={kw}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="filters">
        <MultiSelectDropdown
          label="Content Type"
          options={CONTENT_TYPE_OPTIONS}
          selected={contentTypes}
          onChange={setContentTypes}
        />

        <label className="filter">
          <span className="filter-label">Prefix</span>
          <select
            className="filter-select"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          >
            <option value="">All</option>
            {PREFIX_OPTIONS.map((opt) => (
              <option value={opt} key={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="status">Searching…</p>}
      {error && <p className="status error">{error}</p>}

      {results !== null && !loading && (
        <ul className="results">
          {results.length === 0 && <li className="status">No results found.</li>}
          {results.map((doc) => {
            const fileName = doc.fileName || doc.sharepointPath?.split('/').pop() || 'Untitled'
            const highlights = doc['@search.highlights']?.content || []
            return (
              <li className="result" key={doc.id}>
                <a
                  className="result-title"
                  href={doc.sharepointPath}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fileName}
                </a>

                {doc.purposeScope && (
                  <div className="field">
                    <span className="field-label">Purpose &amp; Scope</span>
                    <p className="field-text">{doc.purposeScope}</p>
                  </div>
                )}

                {highlights.length > 0 && (
                  <div className="field">
                    <span className="field-label">Matched Result</span>
                    {highlights.map((h, idx) => (
                      <p className="field-text" key={`${doc.id}-hl-${idx}`}>
                        {renderHighlighted(h, `${doc.id}-${idx}`)}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export default App
