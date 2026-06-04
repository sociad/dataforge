import { useState, useMemo } from 'react'
import categories from './data/categories.json'
import { animations } from './animations/index.js'
import './index.css'

export default function App() {
  const [selected, setSelected] = useState(null)
  const [expanded, setExpanded] = useState(['sql'])
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map(cat => ({ ...cat, concepts: cat.concepts.filter(c => c.name.toLowerCase().includes(q)) }))
      .filter(cat => cat.concepts.length > 0)
  }, [search])

  const toggle = (id) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-cursor">{'>'}</span>
          <span className="brand-name">dataforge</span>
        </div>

        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="search concepts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <nav className="category-list">
          {filtered.map(cat => (
            <div key={cat.id}>
              <button className="category-header" onClick={() => toggle(cat.id)}>
                <span className={`category-arrow ${expanded.includes(cat.id) ? 'open' : ''}`}>▸</span>
                <span className="category-name">{cat.name}</span>
                <span className="category-count">{cat.concepts.length}</span>
              </button>

              {expanded.includes(cat.id) && (
                <ul className="concept-list">
                  {cat.concepts.map(concept => (
                    <li key={concept.id}>
                      <button
                        className={`concept-item ${selected?.id === concept.id ? 'active' : ''}`}
                        onClick={() => setSelected({ ...concept, categoryName: cat.name })}
                      >
                        {concept.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        {selected ? (
          <div className="concept-view">
            <div className="concept-header">
              <span className="concept-breadcrumb">{selected.categoryName}</span>
              <h1 className="concept-title">{selected.name}</h1>
            </div>
            <div className="concept-body">
              <section className="theory-section">
                <div className="section-label">TEORÍA</div>
                <div className="theory-body">{selected.theory}</div>
                {selected.aplicacion && (
                  <div className="theory-application">
                    <div className="application-label">EN ESTA ANIMACIÓN</div>
                    <ul className="application-list">
                      {selected.aplicacion.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              <section className="animation-section">
                <div className="section-label">EXPLICACIÓN GRÁFICA</div>
                {animations[selected.id]
                  ? <div className="animation-box live">{(() => { const Anim = animations[selected.id]; return <Anim /> })()}</div>
                  : <div className="animation-box">// animation coming soon</div>
                }
              </section>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-label">select a concept</p>
          </div>
        )}
      </main>
    </div>
  )
}
