import { useState } from 'react'

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

function App() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState(null) // null = no search yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/data.json')
      if (!res.ok) throw new Error(`Failed to load data (${res.status})`)
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
