import { useEffect, useRef } from 'react'

const TOTAL_MS = 27000
const CANVAS_H = 290

const DEPT = {
  A: { rgb: [24, 117, 204],  label: 'eng' },
  B: { rgb: [212, 88, 10],   label: 'sales' },
  C: { rgb: [27, 170, 110],  label: 'mktg' },
}
const ACCENT_HEX = '#7C44CC'

const SCENES = [
  { title: 'Datos distribuidos',     desc: 'Tres particiones, una por executor. Cada una tiene filas de todos los departamentos mezcladas.' },
  { title: 'groupBy("dept")',         desc: 'Agrupar por dept requiere que todas las filas del mismo dept estén en el mismo executor.' },
  { title: 'Shuffle write',           desc: 'Cada executor serializa sus filas por hash(dept) y las escribe a disco local. Primer costo.' },
  { title: 'Transferencia de red',    desc: 'Las filas cruzan la red hacia el executor "dueño" de ese dept. El cruce es el costo real.' },
  { title: 'Shuffle read',            desc: 'Cada executor lee las particiones que le corresponden desde los discos de los otros.' },
  { title: 'Particiones homogéneas',  desc: 'Cada executor ahora tiene solo un departamento. La redistribución está completa.' },
  { title: 'Agregación local',        desc: 'sum(salary) se calcula localmente en cada executor — sin más transferencia de red.' },
  { title: 'Costo del shuffle',       desc: 'Shuffle write + red + shuffle read. En TB puede tomar minutos. Se evita con broadcast joins y filtros tempranos.' },
  { title: 'Resultado: 3 filas',      desc: 'groupBy("dept").agg(sum("salary")) retorna 1 fila por departamento. Cada executor aportó una.' },
]

// 3 executors × 3 depts = 9 rows
// After shuffle: E0 → all A, E1 → all B, E2 → all C
const ROWS = [
  { dept: 'A', src: 0, dst: 0, srcSlot: 0, dstSlot: 0 },
  { dept: 'B', src: 0, dst: 1, srcSlot: 1, dstSlot: 0 },
  { dept: 'C', src: 0, dst: 2, srcSlot: 2, dstSlot: 0 },
  { dept: 'A', src: 1, dst: 0, srcSlot: 0, dstSlot: 1 },
  { dept: 'B', src: 1, dst: 1, srcSlot: 1, dstSlot: 1 },
  { dept: 'C', src: 1, dst: 2, srcSlot: 2, dstSlot: 1 },
  { dept: 'A', src: 2, dst: 0, srcSlot: 0, dstSlot: 2 },
  { dept: 'B', src: 2, dst: 1, srcSlot: 1, dstSlot: 2 },
  { dept: 'C', src: 2, dst: 2, srcSlot: 2, dstSlot: 2 },
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eout  = t            => 1 - (1 - t) ** 2
const lerp  = (a, b, t)   => a + (b - a) * t
const eio   = t            => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

function drawChip(ctx, x, y, w, h, rgb, op, label) {
  if (op < 0.01) return
  const [r, g, b] = rgb
  ctx.save()
  ctx.globalAlpha = op
  ctx.fillStyle = `rgba(${r},${g},${b},0.12)`
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = `rgba(${r},${g},${b},0.65)`
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = `rgba(${r},${g},${b},0.9)`
  ctx.font = '500 9px IBM Plex Mono, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + w / 2, y + h / 2)
  ctx.restore()
}

function drawFrame(ctx, W, p) {
  const H = CANVAS_H
  ctx.clearRect(0, 0, W, H)

  const scene =
    p < 0.111 ? 0 : p < 0.222 ? 1 : p < 0.333 ? 2 :
    p < 0.444 ? 3 : p < 0.556 ? 4 : p < 0.667 ? 5 :
    p < 0.778 ? 6 : p < 0.889 ? 7 : 8

  const exeW    = Math.max(68, W * 0.22)
  const exeH    = Math.max(80, H * 0.51)
  const exeTopY = H * 0.24
  const exeXs   = [W * 0.17, W * 0.50, W * 0.83]

  const chipW     = exeW * 0.76
  const chipH     = Math.max(13, exeH * 0.19)
  const chipGap   = Math.max(3, exeH * 0.05)
  const chipAreaH = 3 * chipH + 2 * chipGap
  const chipTop   = exeTopY + (exeH - chipAreaH) / 2

  const exeOp    = eout(pg(p, 0, 0.07))
  const shuffleT = eio(pg(p, 0.333, 0.556))
  const procT    = pg(p, 0.667, 0.762)
  const costOp   = p < 0.889
    ? eout(pg(p, 0.778, 0.840))
    : 1 - eout(pg(p, 0.889, 0.930))
  const resultOp = eout(pg(p, 0.889, 0.950))

  // Executor boxes
  exeXs.forEach((cx, i) => {
    if (exeOp < 0.01) return
    const bx = cx - exeW / 2
    ctx.save()
    ctx.globalAlpha = exeOp
    ctx.fillStyle = 'rgba(0,0,0,0.03)'
    ctx.fillRect(bx, exeTopY, exeW, exeH)
    ctx.strokeStyle = '#D2D7E8'
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, exeTopY, exeW, exeH)
    ctx.fillStyle = '#9099B5'
    ctx.font = '500 9px IBM Plex Mono, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`EXECUTOR ${i + 1}`, cx, exeTopY - 5)
    ctx.restore()
  })

  // Network dashed lines during transfer (scenes 3–4)
  if (scene === 3 || scene === 4) {
    const lineOp = scene === 3
      ? eout(pg(p, 0.333, 0.395))
      : 1 - eout(pg(p, 0.500, 0.556))
    if (lineOp > 0.01) {
      [[0, 1], [1, 2], [0, 2]].forEach(([a, b]) => {
        ctx.save()
        ctx.globalAlpha = lineOp * 0.20
        ctx.strokeStyle = '#4B5680'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(exeXs[a], exeTopY + exeH / 2)
        ctx.lineTo(exeXs[b], exeTopY + exeH / 2)
        ctx.stroke()
        ctx.restore()
      })
    }
  }

  // Row chips: staying first (behind), moving second (on top)
  for (let pass = 0; pass < 2; pass++) {
    ROWS.forEach(row => {
      const moving = row.src !== row.dst
      if (pass === 0 && moving) return
      if (pass === 1 && !moving) return

      const srcX = exeXs[row.src] - chipW / 2
      const srcY = chipTop + row.srcSlot * (chipH + chipGap)
      const dstX = exeXs[row.dst] - chipW / 2
      const dstY = chipTop + row.dstSlot * (chipH + chipGap)

      let cx = lerp(srcX, dstX, shuffleT)
      let cy = lerp(srcY, dstY, shuffleT)
      if (moving) {
        // right-going arcs up, left-going arcs down — prevents overlap in transit
        const arcDir = dstX > srcX ? -1 : 1
        cy += arcDir * Math.abs(dstX - srcX) * 0.15 * Math.sin(shuffleT * Math.PI)
      }

      drawChip(ctx, cx, cy, chipW, chipH, DEPT[row.dept].rgb, exeOp, DEPT[row.dept].label)
    })
  }

  // SQL query label (scenes 1–2)
  if (p > 0.095 && p < 0.340) {
    const textOp = p < 0.222
      ? eout(pg(p, 0.095, 0.160))
      : 1 - eout(pg(p, 0.295, 0.340))
    ctx.save()
    ctx.globalAlpha = textOp
    ctx.fillStyle = '#1A2040'
    ctx.font = '500 10px IBM Plex Mono, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('groupBy("dept").agg(sum("salary"))', W / 2, H * 0.115)
    ctx.restore()
  }

  // Processing bars (scene 6)
  if (procT > 0.01) {
    exeXs.forEach((cx, i) => {
      const [r, g, b] = DEPT[['A', 'B', 'C'][i]].rgb
      const bx = cx - exeW / 2 + 8
      const by = exeTopY + exeH - 14
      const bw = exeW - 16
      ctx.save()
      ctx.globalAlpha = exeOp
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      ctx.fillRect(bx, by, bw, 5)
      ctx.fillStyle = `rgba(${r},${g},${b},0.7)`
      ctx.fillRect(bx, by, bw * procT, 5)
      ctx.restore()
    })
  }

  // Cost breakdown bars (scene 7)
  if (costOp > 0.01) {
    const labels = ['write', 'network', 'read']
    const fills  = [0.45, 1.0, 0.40]
    const totalW = W * 0.52
    const bh     = 11
    const bgap   = 5
    const bw     = (totalW - 2 * bgap) / 3
    const bx0    = W / 2 - totalW / 2
    const by     = H * 0.84
    labels.forEach((lbl, i) => {
      const bx = bx0 + i * (bw + bgap)
      ctx.save()
      ctx.globalAlpha = costOp
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = i === 1 ? '#D4580A' : '#9099B5'
      ctx.fillRect(bx, by, bw * fills[i] * Math.min(1, costOp * 1.5), bh)
      ctx.fillStyle = '#4B5680'
      ctx.font = '400 9px IBM Plex Mono, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(lbl, bx + bw / 2, by + bh + 3)
      ctx.restore()
    })
  }

  // Result chips (scene 8)
  if (resultOp > 0.01) {
    const rw = chipW * 0.82
    const rh = chipH * 0.82
    const ry = exeTopY + exeH + 16
    exeXs.forEach((cx, i) => {
      const key = ['A', 'B', 'C'][i]
      drawChip(ctx, cx - rw / 2, ry, rw, rh, DEPT[key].rgb, resultOp, `${DEPT[key].label} Σ`)
    })
  }

  return scene
}

export default function Shuffle() {
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)
  const clock       = useRef({ playing: true, startTs: null, elapsed: 0 })

  const titleRef    = useRef(null)
  const descRef     = useRef(null)
  const textFadeRef = useRef(null)
  const btnRef      = useRef(null)
  const scrubberRef = useRef(null)

  const isDragging  = useRef(false)
  const wasPaused   = useRef(false)
  const prevScene   = useRef(0)
  const timers      = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    const W = canvas.offsetWidth
    canvas.width  = W
    canvas.height = CANVAS_H

    const tick = ts => {
      const c = clock.current
      if (c.playing) {
        if (!c.startTs) c.startTs = ts - c.elapsed
        c.elapsed = ts - c.startTs
      }
      const p = (c.elapsed % TOTAL_MS) / TOTAL_MS
      const scene = drawFrame(canvas.getContext('2d'), W, p)

      if (!isDragging.current && scrubberRef.current)
        scrubberRef.current.value = String(Math.floor(p * 1000))

      if (scene !== prevScene.current) {
        const target = scene
        prevScene.current = target
        const el = textFadeRef.current
        if (el) {
          el.style.transition = 'opacity 0.35s ease'
          el.style.opacity    = '0'
          const t = setTimeout(() => {
            if (prevScene.current !== target) return
            if (titleRef.current) titleRef.current.textContent = SCENES[target].title
            if (descRef.current)  descRef.current.textContent  = SCENES[target].desc
            el.style.transition = 'opacity 0.55s ease'
            el.style.opacity    = '1'
          }, 380)
          timers.current.push(t)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', width: '100%', fontFamily: "'IBM Plex Mono', monospace" }}>
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%' }} />
          <div style={{ width: '100%', height: CANVAS_H }} />
        </div>

        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative', background: 'rgba(0,0,0,0.04)', border: '1px solid #D2D7E8', borderRadius: 4, minHeight: 0 }}>
            <div ref={textFadeRef} style={{ position: 'absolute', inset: 0, padding: '13px 14px', opacity: 1 }}>
              <div ref={titleRef} style={{ fontSize: 11, fontWeight: 700, color: '#1A2040', marginBottom: 8, lineHeight: 1.4 }}>
                {SCENES[0].title}
              </div>
              <div ref={descRef} style={{ fontSize: 11, color: '#4B5680', lineHeight: 1.6 }}>
                {SCENES[0].desc}
              </div>
            </div>
          </div>

          <div style={{ padding: '11px 14px', background: 'rgba(0,0,0,0.04)', border: '1px solid #D2D7E8', borderRadius: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#9099B5', marginBottom: 9, textTransform: 'uppercase' }}>Cluster</div>
            {[
              { label: 'Executors', value: '3' },
              { label: 'Rows',      value: '9' },
              { label: 'Depts',     value: '3' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: '#4B5680' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2040', letterSpacing: '-0.02em' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={scrubberRef}
        type="range" min="0" max="1000" defaultValue="0"
        style={{ width: '100%', accentColor: ACCENT_HEX, cursor: 'pointer', flexShrink: 0 }}
        onPointerDown={() => { wasPaused.current = !clock.current.playing; clock.current.playing = false; isDragging.current = true }}
        onInput={e => { clock.current.elapsed = (parseInt(e.target.value) / 1000) * TOTAL_MS; clock.current.startTs = null }}
        onPointerUp={() => { isDragging.current = false; if (!wasPaused.current) { clock.current.playing = true; clock.current.startTs = null; if (btnRef.current) btnRef.current.textContent = '⏸ pausar' } }}
      />

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button ref={btnRef} onClick={togglePlay}
          style={{ padding: '6px 16px', background: ACCENT_HEX, border: 'none', borderRadius: 3, color: 'white', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' }}>
          ⏸ pausar
        </button>
        <button onClick={restart}
          style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #D2D7E8', borderRadius: 3, color: '#6B7592', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, cursor: 'pointer' }}>
          ↺ reiniciar
        </button>
      </div>
    </div>
  )
}
