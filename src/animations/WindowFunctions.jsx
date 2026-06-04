import { useEffect, useRef } from 'react'

// ── Data ─────────────────────────────────────────────────────────
const ROW_H    = 40
const HEADER_H = 34
const TOTAL_MS = 18000   // 9 escenas × 2 s cada una

const ROWS = [
  { dept: 'eng',   name: 'Alice', salary: 90 },
  { dept: 'eng',   name: 'Bob',   salary: 70 },
  { dept: 'eng',   name: 'Carol', salary: 80 },
  { dept: 'sales', name: 'Dave',  salary: 60 },
  { dept: 'sales', name: 'Eve',   salary: 75 },
  { dept: 'sales', name: 'Frank', salary: 65 },
]

const RUNNING = (() => {
  const acc = {}
  return ROWS.map(r => (acc[r.dept] = (acc[r.dept] || 0) + r.salary))
})()

const ENG_RGB   = [24, 117, 204]
const SALES_RGB = [212, 88, 10]
const ENG_HEX   = '#1875CC'
const SLS_HEX   = '#D4580A'

// ── Math ─────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eio   = t => t < 0.5 ? 2*t*t : -1 + (4-2*t)*t
const eout  = t => 1 - (1-t)**2
const ein   = t => t*t

// ── Timeline ─────────────────────────────────────────────────────
// 9 escenas, cada una ocupa exactamente 1/9 ≈ 0.111 de p
// Límites: 0, 0.111, 0.222, 0.333, 0.444, 0.556, 0.667, 0.778, 0.889, 1.000

function computeFrame(p) {
  const H = HEADER_H, R = ROW_H

  // ── Scanner ──
  let scan = { op: 0, top: H, bot: H + R, rgb: ENG_RGB }

  // ENG scan: aparece en escena 2, se extiende en 3 y 4, desaparece a mitad de 4
  if (p >= 0.222 && p < 0.510) {
    const op = eout(pg(p, 0.222, 0.258))
    const e1 = eio(pg(p, 0.333, 0.378))
    const e2 = eio(pg(p, 0.444, 0.489))
    scan = { op, top: H, bot: H + R + e1*R + e2*R, rgb: ENG_RGB }
  }
  if (p >= 0.510 && p < 0.556) {
    scan = { op: 1 - ein(pg(p, 0.510, 0.548)), top: H, bot: H + 3*R, rgb: ENG_RGB }
  }

  // SALES scan: aparece en escena 5, se extiende en 6 y 7, desaparece a mitad de 7
  if (p >= 0.556 && p < 0.845) {
    const sT = H + 3*R
    const op = eout(pg(p, 0.556, 0.592))
    const e1 = eio(pg(p, 0.667, 0.712))
    const e2 = eio(pg(p, 0.778, 0.823))
    scan = { op, top: sT, bot: sT + R + e1*R + e2*R, rgb: SALES_RGB }
  }
  if (p >= 0.845 && p < 0.889) {
    const sT = H + 3*R
    scan = { op: 1 - ein(pg(p, 0.845, 0.882)), top: sT, bot: sT + 3*R, rgb: SALES_RGB }
  }

  // ── Rows ──
  const inW = [
    (p >= 0.258 && p < 0.548) || p >= 0.889,
    (p >= 0.378 && p < 0.548) || p >= 0.889,
    (p >= 0.489 && p < 0.548) || p >= 0.889,
    (p >= 0.592 && p < 0.848) || p >= 0.889,
    (p >= 0.712 && p < 0.848) || p >= 0.889,
    (p >= 0.823 && p < 0.848) || p >= 0.889,
  ]

  const curRow =
    p >= 0.258 && p < 0.378 ? 0 :
    p >= 0.378 && p < 0.489 ? 1 :
    p >= 0.489 && p < 0.510 ? 2 :
    p >= 0.592 && p < 0.712 ? 3 :
    p >= 0.712 && p < 0.823 ? 4 :
    p >= 0.823 && p < 0.845 ? 5 : -1

  const partActive = p >= 0.140
  const divOp      = Math.min(1, pg(p, 0.111, 0.190))

  // Escena: exactamente 1/9 de p por escena
  const scene =
    p < 0.111 ? 0 :
    p < 0.222 ? 1 :
    p < 0.333 ? 2 :
    p < 0.444 ? 3 :
    p < 0.556 ? 4 :
    p < 0.667 ? 5 :
    p < 0.778 ? 6 :
    p < 0.889 ? 7 : 8

  return { scan, inW, partActive, curRow, divOp, scene, showComp: p >= 0.889 }
}

// ── Canvas ───────────────────────────────────────────────────────
function drawFrame(ctx, W, frame) {
  const { scan, inW, partActive, curRow, divOp } = frame
  const H = HEADER_H, R = ROW_H

  ctx.clearRect(0, 0, W, H + 6*R)

  ROWS.forEach((_, i) => {
    if (!inW[i]) return
    const [r, g, b] = i < 3 ? ENG_RGB : SALES_RGB
    ctx.fillStyle = `rgba(${r},${g},${b},${i === curRow ? 0.13 : 0.06})`
    ctx.fillRect(0, H + i*R, W, R)
  })

  if (partActive) {
    ctx.fillStyle = `rgba(${ENG_RGB.join(',')},0.75)`
    ctx.fillRect(0, H, 3, 3*R)
    ctx.fillStyle = `rgba(${SALES_RGB.join(',')},0.75)`
    ctx.fillRect(0, H+3*R, 3, 3*R)
  }

  if (divOp > 0) {
    ctx.save()
    ctx.setLineDash([4, 5])
    ctx.strokeStyle = `rgba(0,0,0,${0.18 * divOp})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, H+3*R); ctx.lineTo(W, H+3*R)
    ctx.stroke()
    ctx.restore()
  }

  if (scan.op > 0.01) {
    const [r, g, b] = scan.rgb
    const h = scan.bot - scan.top

    ctx.fillStyle = `rgba(${r},${g},${b},${0.06 * scan.op})`
    ctx.fillRect(2, scan.top+1, W-4, h-2)

    ctx.save()
    ctx.shadowBlur  = 10
    ctx.shadowColor = `rgba(${r},${g},${b},${0.3 * scan.op})`
    ctx.strokeStyle = `rgba(${r},${g},${b},${scan.op})`
    ctx.lineWidth   = 1.5
    ctx.strokeRect(2, scan.top+1, W-4, h-2)
    ctx.restore()

    if (scan.op > 0.45 && h > 12) {
      const tag = 'WINDOW FRAME'
      ctx.font = '500 9px IBM Plex Mono, monospace'
      const tw = ctx.measureText(tag).width
      const bx = W - tw - 14
      const by = scan.top - 22

      ctx.fillStyle = `rgba(${r},${g},${b},${0.1 * scan.op})`
      ctx.fillRect(bx-5, by-10, tw+10, 14)
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 * scan.op})`
      ctx.lineWidth = 0.75
      ctx.strokeRect(bx-5, by-10, tw+10, 14)

      ctx.fillStyle    = `rgba(${r},${g},${b},${scan.op * 0.85})`
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(tag, bx, by)

      ctx.save()
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 * scan.op})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(bx + tw/2, by + 4); ctx.lineTo(bx + tw/2, scan.top)
      ctx.stroke()
      ctx.restore()
    }

    if (curRow >= 0) {
      ctx.fillStyle    = `rgba(${r},${g},${b},${scan.op * 0.8})`
      ctx.font         = '11px sans-serif'
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText('◄', W - 4, H + curRow*R + R/2)
    }
  }
}

// ── Scenes ───────────────────────────────────────────────────────
const SCENES = [
  { title: 'Datos de entrada',             desc: 'Suma acumulada de salario por departamento, sin perder ninguna fila.' },
  { title: 'PARTITION BY dept',            desc: 'Dos grupos independientes. Cada partición se procesa como una tabla separada.' },
  { title: 'eng · fila 1 de 3',           desc: 'La ventana cubre solo la fila actual. SUM = 90k.' },
  { title: 'eng · fila 2 de 3',           desc: 'La ventana crece. Acumula las anteriores: 90 + 70 = 160k.' },
  { title: 'eng · completado',            desc: '90 + 70 + 80 = 240k. La ventana se cierra.' },
  { title: 'Nueva partición: sales',       desc: 'Reinicia desde cero. Independiente de eng.' },
  { title: 'sales · fila 2 de 3',         desc: '60 + 75 = 135k.' },
  { title: 'sales · completado',          desc: '60 + 75 + 65 = 200k.' },
  { title: '6 filas entran → 6 salen',    desc: '' },
]

// ── Component ────────────────────────────────────────────────────
export default function WindowFunctions() {
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)
  const rafRef      = useRef(null)
  const clock       = useRef({ playing: true, startTs: null, elapsed: 0 })

  const titleRef    = useRef(null)
  const descRef     = useRef(null)
  const textFadeRef = useRef(null)
  const sumRef      = useRef(null)
  const compRef     = useRef(null)
  const btnRef      = useRef(null)
  const resultCells = useRef([])
  const scrubberRef = useRef(null)

  const isDragging  = useRef(false)
  const wasPaused   = useRef(false)
  const prev        = useRef({ scene: 0, curRow: -1, showComp: false, inW: Array(6).fill(false) })
  const timers      = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    const W      = wrapRef.current.clientWidth
    canvas.width  = W
    canvas.height = HEADER_H + 6 * ROW_H

    const tick = (ts) => {
      const c = clock.current
      if (c.playing) {
        if (!c.startTs) c.startTs = ts - c.elapsed
        c.elapsed = ts - c.startTs
      }
      const p = (c.elapsed % TOTAL_MS) / TOTAL_MS
      const f = computeFrame(p)

      drawFrame(canvas.getContext('2d'), W, f)

      if (!isDragging.current && scrubberRef.current)
        scrubberRef.current.value = String(Math.floor(p * 1000))

      // Result cells
      f.inW.forEach((lit, i) => {
        if (lit === prev.current.inW[i]) return
        prev.current.inW[i] = lit
        const el = resultCells.current[i]
        if (el) el.style.opacity = lit ? '1' : '0'
      })

      // Annotation text cross-dissolve
      if (f.scene !== prev.current.scene) {
        const target = f.scene
        prev.current.scene = target
        const el = textFadeRef.current
        if (el) {
          el.style.transition = 'opacity 0.38s ease'
          el.style.opacity    = '0'
          if (target < 8) {
            const t = setTimeout(() => {
              if (prev.current.scene !== target) return
              if (titleRef.current) titleRef.current.textContent = SCENES[target].title
              if (descRef.current)  descRef.current.textContent  = SCENES[target].desc
              el.style.transition = 'opacity 0.6s ease'
              el.style.opacity    = '1'
            }, 400)
            timers.current.push(t)
          }
          // Scene 8: text fades out and stays out; showComp handler fades in comparison
        }
      }

      // Running sum fade swap
      if (f.curRow !== prev.current.curRow) {
        const row = f.curRow
        prev.current.curRow = row
        const el = sumRef.current
        if (el) {
          el.style.transition = 'opacity 0.28s ease'
          el.style.opacity    = '0'
          const t = setTimeout(() => {
            if (!sumRef.current) return
            sumRef.current.textContent      = row >= 0 ? `${RUNNING[row]}k` : '—'
            sumRef.current.style.color      = row >= 0 ? (row < 3 ? ENG_HEX : SLS_HEX) : '#B0B8D0'
            sumRef.current.style.transition = 'opacity 0.5s ease'
            sumRef.current.style.opacity    = '1'
          }, 300)
          timers.current.push(t)
        }
      }

      // Comparison cross-fade (inside same box as annotation)
      if (f.showComp !== prev.current.showComp) {
        prev.current.showComp = f.showComp
        if (f.showComp) {
          const t = setTimeout(() => {
            if (compRef.current) {
              compRef.current.style.transition = 'opacity 0.7s ease'
              compRef.current.style.opacity    = '1'
            }
          }, 420)
          timers.current.push(t)
        } else {
          if (compRef.current) {
            compRef.current.style.transition = 'opacity 0.3s ease'
            compRef.current.style.opacity    = '0'
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      timers.current.forEach(clearTimeout)
    }
  }, [])

  const togglePlay = () => {
    const c = clock.current
    c.playing = !c.playing
    if (c.playing) c.startTs = null
    if (btnRef.current) btnRef.current.textContent = c.playing ? '⏸ pausar' : '▶ continuar'
  }

  const restart = () => {
    const c = clock.current
    c.elapsed = 0; c.startTs = null; c.playing = true
    if (btnRef.current) btnRef.current.textContent = '⏸ pausar'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* ── Main row ── */}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>

        {/* Table + canvas */}
        <div ref={wrapRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ height: HEADER_H, background: 'rgba(0,0,0,0.05)' }}>
                {['dept','name','salary','running_sum'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 14px', color: '#9099B5', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', borderBottom: '1px solid #D2D7E8', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={i} style={{ height: ROW_H }}>
                  <td style={{ padding: '0 14px 0 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', color: i < 3 ? ENG_HEX : SLS_HEX, fontWeight: 600, fontSize: 11 }}>{row.dept}</td>
                  <td style={{ padding: '0 14px', borderBottom: '1px solid rgba(0,0,0,0.07)', color: '#1A2040' }}>{row.name}</td>
                  <td style={{ padding: '0 14px', borderBottom: '1px solid rgba(0,0,0,0.07)', color: '#1A2040' }}>{row.salary}k</td>
                  <td style={{ padding: '0 14px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                    <span ref={el => { resultCells.current[i] = el }} style={{ opacity: 0, color: '#4B5680', transition: 'opacity 0.45s ease' }}>
                      {RUNNING[i]}k
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fixed info panel */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Running sum */}
          <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.05)', border: '1px solid #D2D7E8', borderRadius: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#9099B5', marginBottom: 8, textTransform: 'uppercase' }}>Suma acumulada</div>
            <span ref={sumRef} style={{ fontSize: 24, fontWeight: 700, color: '#B0B8D0', letterSpacing: '-0.02em', display: 'block' }}>—</span>
          </div>

          {/* Annotation ↔ Comparison: mismo contenedor, cross-fade interno */}
          <div style={{ flex: 1, position: 'relative', background: 'rgba(0,0,0,0.04)', border: '1px solid #D2D7E8', borderRadius: 4, minHeight: 0 }}>

            {/* Annotation text */}
            <div ref={textFadeRef} style={{ position: 'absolute', inset: 0, padding: '13px 14px', opacity: 1 }}>
              <div ref={titleRef} style={{ fontSize: 11, fontWeight: 700, color: '#1A2040', marginBottom: 7, lineHeight: 1.4 }}>
                {SCENES[0].title}
              </div>
              <div ref={descRef} style={{ fontSize: 11, color: '#4B5680', lineHeight: 1.6 }}>
                {SCENES[0].desc}
              </div>
            </div>

            {/* Comparison — cross-fade con la anotación */}
            <div ref={compRef} style={{ position: 'absolute', inset: 0, padding: '13px 14px', opacity: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', color: '#9099B5', marginBottom: 12, textTransform: 'uppercase' }}>GROUP BY dept</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.07)', marginBottom: 8 }}>
                <span style={{ color: ENG_HEX, fontWeight: 600, fontSize: 13 }}>eng</span>
                <span style={{ color: '#4B5680', fontSize: 13 }}>240k</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #D2D7E8', marginBottom: 10 }}>
                <span style={{ color: SLS_HEX, fontWeight: 600, fontSize: 13 }}>sales</span>
                <span style={{ color: '#4B5680', fontSize: 13 }}>200k</span>
              </div>
              <div style={{ fontSize: 10, color: '#9099B5', lineHeight: 1.6, marginBottom: 8 }}>
                2 filas — sin identidad por empleado.
              </div>
              <div style={{ fontSize: 11, color: '#1A9B62', fontWeight: 700 }}>
                Window function → 6 filas ↑
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Query ── */}
      <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.06)', border: '1px solid #D2D7E8', borderRadius: 3, fontSize: 11, color: '#9099B5', flexShrink: 0, lineHeight: 1 }}>
        <span style={{ color: '#4B5680' }}>SUM</span>(salary){' '}
        <span style={{ color: '#4B5680' }}>OVER</span> ({' '}
        <span style={{ color: ENG_HEX }}>PARTITION BY</span> dept{' '}
        <span style={{ color: '#4B5680' }}>ORDER BY</span> name{' '}
        <span style={{ color: '#4B5680' }}>ROWS BETWEEN</span> UNBOUNDED PRECEDING{' '}
        <span style={{ color: '#4B5680' }}>AND</span> CURRENT ROW )
      </div>

      {/* ── Scrubber ── */}
      <input
        ref={scrubberRef}
        type="range" min="0" max="1000" defaultValue="0"
        style={{ width: '100%', accentColor: ENG_HEX, cursor: 'pointer', flexShrink: 0 }}
        onPointerDown={() => { wasPaused.current = !clock.current.playing; clock.current.playing = false; isDragging.current = true }}
        onInput={e => { clock.current.elapsed = (parseInt(e.target.value) / 1000) * TOTAL_MS; clock.current.startTs = null }}
        onPointerUp={() => { isDragging.current = false; if (!wasPaused.current) { clock.current.playing = true; clock.current.startTs = null; if (btnRef.current) btnRef.current.textContent = '⏸ pausar' } }}
      />

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button ref={btnRef} onClick={togglePlay} style={{ padding: '6px 16px', background: ENG_HEX, border: 'none', borderRadius: 3, color: 'white', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' }}>
          ⏸ pausar
        </button>
        <button onClick={restart} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #D2D7E8', borderRadius: 3, color: '#6B7592', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, cursor: 'pointer' }}>
          ↺ reiniciar
        </button>
      </div>
    </div>
  )
}
