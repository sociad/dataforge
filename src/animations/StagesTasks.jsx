import { useEffect, useRef } from 'react'

const TOTAL_MS = 27000
const CANVAS_H = 290

const EXE_COLORS = [
  [212, 88,  10],
  [27,  170, 110],
  [124, 68,  204],
]
const DRV_RGB = [24, 117, 204]
const DRV_HEX = '#1875CC'
const ACCENT  = '#1875CC'

const SCENES = [
  { title: 'Una Action dispara un Job',    desc: '.count() es una Action. Spark analiza el DAG completo y crea un Job para ejecutarlo.' },
  { title: 'El Job se divide en Stages',   desc: 'Cada operación que requiere shuffle crea un Stage boundary. Este Job tiene 2 Stages.' },
  { title: 'Stage 1: 6 Tasks dispatched', desc: '6 particiones → 6 Tasks. Se reparten en los slots disponibles: 2 por executor.' },
  { title: 'Ejecución en paralelo',        desc: 'Los 6 Tasks corren al mismo tiempo. Un Task = una función aplicada a una partición.' },
  { title: 'Stage 1 completa',            desc: 'El Stage no cierra hasta que el último Task finaliza. Un Task lento retrasa a todos.' },
  { title: 'Shuffle boundary',            desc: 'Los datos se redistribuyen por hash(key). Stage 2 no puede empezar antes de que Stage 1 termine.' },
  { title: 'Stage 2: 3 Tasks',           desc: 'Después del shuffle quedan 3 particiones → 3 Tasks. Un slot activo por executor.' },
  { title: 'Job terminado',               desc: 'Duración total: tiempo(Stage 1) + shuffle + tiempo(Stage 2). Los stages suman, no se solapan.' },
  { title: 'Job → Stage → Task → Slot',  desc: '1 Job tiene N Stages secuenciales. Cada Stage tiene M Tasks paralelos. Cada Task ocupa 1 Slot (1 core).' },
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eout  = t            => 1 - (1 - t) ** 2
const lerp  = (a, b, t)   => a + (b - a) * t

function drawSlot(ctx, x, y, w, h, rgb, op, procT, doneOp, label) {
  if (op < 0.01) return
  const [r, g, b] = rgb
  ctx.save()
  ctx.globalAlpha = op
  ctx.fillStyle   = `rgba(${r},${g},${b},0.10)`
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`
  ctx.lineWidth   = 1
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle   = `rgba(${r},${g},${b},0.65)`
  ctx.font        = '500 8px IBM Plex Mono, monospace'
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + w / 2, y + 3)
  if (procT > 0.01 && doneOp < 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(x + 3, y + h - 7, w - 6, 4)
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`
    ctx.fillRect(x + 3, y + h - 7, (w - 6) * Math.min(1, procT), 4)
  }
  if (doneOp > 0.01) {
    ctx.globalAlpha = op * doneOp
    ctx.fillStyle   = `rgba(${r},${g},${b},0.9)`
    ctx.font        = '700 12px IBM Plex Mono, monospace'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✓', x + w / 2, y + h * 0.60)
  }
  ctx.restore()
}

function drawFrame(ctx, W, p) {
  const H = CANVAS_H
  ctx.clearRect(0, 0, W, H)

  const scene =
    p < 0.111 ? 0 : p < 0.222 ? 1 : p < 0.333 ? 2 :
    p < 0.444 ? 3 : p < 0.556 ? 4 : p < 0.667 ? 5 :
    p < 0.778 ? 6 : p < 0.889 ? 7 : 8

  // Layout
  const drvW  = W * 0.18, drvH  = H * 0.12
  const drvX  = W * 0.03, drvY  = H * 0.04
  const drvCx = drvX + drvW / 2, drvCy = drvY + drvH / 2

  const exeW  = W * 0.86, exeH = H * 0.155
  const exeX  = W * 0.07
  const exeGap = H * 0.030
  const exeYs = [
    H * 0.340,
    H * 0.340 + exeH + exeGap,
    H * 0.340 + 2 * (exeH + exeGap),
  ]

  const slotW = exeW * 0.155, slotH = exeH * 0.62
  const slotYoff = (exeH - slotH) / 2
  const slotsX   = exeX + exeW * 0.460  // center of slot area

  // Progress values
  const initOp    = eout(pg(p, 0, 0.07))
  const actionOp  = scene <= 1 ? eout(pg(p, 0.02, 0.09)) : 1 - eout(pg(p, 0.222, 0.275))
  const dagOp     = scene === 1 ? eout(pg(p, 0.111, 0.185)) : scene > 1 ? 1 - eout(pg(p, 0.222, 0.275)) : 0
  const exeOp     = scene >= 2 ? eout(pg(p, 0.222, 0.290)) : 0

  // Stage 1 slots
  const s1Op      = scene >= 2 && scene <= 4 ? eout(pg(p, 0.245, 0.315))
                  : scene === 5             ? 1 - eout(pg(p, 0.580, 0.640))
                  : 0
  const s1ProcT   = eout(pg(p, 0.333, 0.440))
  const s1DoneOp  = eout(pg(p, 0.444, 0.520))

  // Shuffle
  const shuffleOp = scene === 5 ? eout(pg(p, 0.560, 0.630)) : 0
  const shuffleT  = pg(p, 0.560, 0.650)

  // Stage 2 slots
  const s2Op      = scene >= 6 ? eout(pg(p, 0.667, 0.730)) : 0
  const s2ProcT   = eout(pg(p, 0.710, 0.840))
  const s2DoneOp  = eout(pg(p, 0.800, 0.870))

  // Result dots (scene 7)
  const resultOp  = scene === 7 ? eout(pg(p, 0.790, 0.840)) : 0
  const resultT   = pg(p, 0.810, 0.889)

  // Summary (scene 8)
  const summaryOp = eout(pg(p, 0.889, 0.950))

  // Stage header logic
  const s1HeaderOp = scene >= 2 && scene <= 4 ? eout(pg(p, 0.222, 0.270))
                   : scene === 5 ? 1 - eout(pg(p, 0.556, 0.620)) : 0
  const s2HeaderOp = scene >= 6 ? eout(pg(p, 0.667, 0.720)) : 0
  const shHeaderOp = scene === 5 ? eout(pg(p, 0.556, 0.625)) : 0

  // ── DRAW ──────────────────────────────────────────────

  // Driver box
  if (initOp > 0.01) {
    const [r, g, b] = DRV_RGB
    ctx.save()
    ctx.globalAlpha = initOp
    ctx.fillStyle   = `rgba(${r},${g},${b},0.07)`
    ctx.fillRect(drvX, drvY, drvW, drvH)
    ctx.shadowBlur  = 8
    ctx.shadowColor = `rgba(${r},${g},${b},0.3)`
    ctx.strokeStyle = `rgba(${r},${g},${b},1)`
    ctx.lineWidth   = 1.5
    ctx.strokeRect(drvX, drvY, drvW, drvH)
    ctx.shadowBlur  = 0
    ctx.fillStyle   = `rgba(${r},${g},${b},0.9)`
    ctx.font        = '600 9px IBM Plex Mono, monospace'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DRIVER', drvCx, drvCy)
    ctx.restore()
  }

  // Action + Job label (scenes 0-1)
  if (actionOp > 0.01 && initOp > 0.01) {
    ctx.save()
    ctx.globalAlpha = actionOp * initOp
    ctx.fillStyle   = '#00CFFF'
    ctx.font        = '500 10px IBM Plex Mono, monospace'
    ctx.textAlign   = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('.count()', drvX + drvW + 8, drvCy - 5)
    ctx.fillStyle   = '#4B5680'
    ctx.font        = '400 9px IBM Plex Mono, monospace'
    ctx.fillText('→  JOB #1', drvX + drvW + 8, drvCy + 7)
    ctx.restore()
  }

  // DAG diagram (scene 1)
  if (dagOp > 0.01) {
    const dy  = H * 0.36, dh = H * 0.22
    const bw  = W * 0.26
    const s1x = W * 0.06, s2x = W * 0.68

    const drawStageBox = (bx, rgb, stageLabel, taskLabel) => {
      const [r, g, b] = rgb
      ctx.fillStyle   = `rgba(${r},${g},${b},0.07)`
      ctx.fillRect(bx, dy, bw, dh)
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`
      ctx.lineWidth   = 1
      ctx.strokeRect(bx, dy, bw, dh)
      ctx.fillStyle   = `rgba(${r},${g},${b},0.85)`
      ctx.font        = '700 9px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(stageLabel, bx + bw / 2, dy + dh * 0.38)
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '400 8px IBM Plex Mono, monospace'
      ctx.fillText(taskLabel, bx + bw / 2, dy + dh * 0.68)
    }

    ctx.save()
    ctx.globalAlpha = dagOp
    drawStageBox(s1x, EXE_COLORS[0], 'STAGE 1', '6 tasks')
    drawStageBox(s2x, EXE_COLORS[1], 'STAGE 2', '3 tasks')

    // Arrow + shuffle label
    const midX = (s1x + bw + s2x) / 2
    ctx.strokeStyle = '#9099B5'
    ctx.lineWidth   = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(s1x + bw + 4, dy + dh / 2)
    ctx.lineTo(s2x - 4, dy + dh / 2)
    ctx.stroke()
    ctx.setLineDash([])
    const [ro, go, bo] = EXE_COLORS[0]
    ctx.fillStyle    = `rgba(${ro},${go},${bo},0.8)`
    ctx.font         = '500 8px IBM Plex Mono, monospace'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('shuffle', midX, dy + dh / 2)
    ctx.restore()
  }

  // Stage header
  const drawStageHeader = (label, rgb, subLabel, op) => {
    if (op < 0.01) return
    const [r, g, b] = rgb
    ctx.save()
    ctx.globalAlpha = op
    ctx.fillStyle   = `rgba(${r},${g},${b},0.85)`
    ctx.font        = '700 10px IBM Plex Mono, monospace'
    ctx.textAlign   = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, exeX, H * 0.27)
    ctx.fillStyle   = '#9099B5'
    ctx.font        = '400 9px IBM Plex Mono, monospace'
    ctx.textAlign   = 'right'
    ctx.fillText(subLabel, exeX + exeW, H * 0.27)
    ctx.restore()
  }

  drawStageHeader('STAGE 1', EXE_COLORS[0], '6 tasks · 2 slots / executor', s1HeaderOp)
  drawStageHeader('SHUFFLE', [212, 88, 10],  'redistributing data...', shHeaderOp)
  drawStageHeader('STAGE 2', EXE_COLORS[1], '3 tasks · 1 slot / executor', s2HeaderOp)

  // Executor boxes
  if (exeOp > 0.01) {
    exeYs.forEach((ey, i) => {
      ctx.save()
      ctx.globalAlpha = exeOp
      ctx.fillStyle   = 'rgba(0,0,0,0.03)'
      ctx.fillRect(exeX, ey, exeW, exeH)
      ctx.strokeStyle = '#D2D7E8'
      ctx.lineWidth   = 1.5
      ctx.strokeRect(exeX, ey, exeW, exeH)
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '500 9px IBM Plex Mono, monospace'
      ctx.textAlign   = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`EXECUTOR ${i + 1}`, exeX + 10, ey + exeH / 2)
      ctx.restore()
    })
  }

  // Stage 1 slots (2 per executor)
  if (s1Op > 0.01) {
    exeYs.forEach((ey, i) => {
      const [r, g, b] = EXE_COLORS[i]
      const sy   = ey + slotYoff
      const x1   = slotsX - slotW - 5
      const x2   = slotsX + 5
      drawSlot(ctx, x1, sy, slotW, slotH, [r, g, b], s1Op, s1ProcT, s1DoneOp, `P${i * 2 + 1}`)
      drawSlot(ctx, x2, sy, slotW, slotH, [r, g, b], s1Op, s1ProcT, s1DoneOp, `P${i * 2 + 2}`)
    })
  }

  // Shuffle dots (scene 5)
  if (shuffleOp > 0.01) {
    const pairs = [[0, 1], [1, 2], [2, 0]]
    pairs.forEach(([src, dst]) => {
      const sy = exeYs[src] + exeH / 2
      const dy = exeYs[dst] + exeH / 2
      const t  = Math.min(1, shuffleT * 1.3)
      const x  = exeX + exeW * lerp(0.50, 0.82, t)
      const y  = lerp(sy, dy, eout(t))
      const [r, g, b] = EXE_COLORS[dst]
      ctx.save()
      ctx.globalAlpha = shuffleOp * 0.85
      ctx.fillStyle   = `rgba(${r},${g},${b},0.75)`
      ctx.shadowBlur  = 6
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })
  }

  // Stage 2 slots (1 per executor, centered)
  if (s2Op > 0.01) {
    exeYs.forEach((ey, i) => {
      const [r, g, b] = EXE_COLORS[i]
      const sy  = ey + slotYoff
      const sx  = slotsX - slotW / 2
      drawSlot(ctx, sx, sy, slotW, slotH, [r, g, b], s2Op, s2ProcT, s2DoneOp, `P${i + 1}'`)
    })
  }

  // Result dots: executors → Driver (scene 7)
  if (resultOp > 0.01) {
    exeYs.forEach((ey, i) => {
      const t = clamp(resultT * 1.4 - i * 0.18, 0, 1)
      if (t < 0.01) return
      const sx = slotsX, sy = ey + exeH / 2
      const [r, g, b] = DRV_RGB
      ctx.save()
      ctx.globalAlpha = resultOp * eout(t)
      ctx.fillStyle   = `rgba(${r},${g},${b},0.85)`
      ctx.shadowBlur  = 7
      ctx.shadowColor = `rgba(${r},${g},${b},0.6)`
      ctx.beginPath()
      ctx.arc(lerp(sx, drvCx, eout(t)), lerp(sy, drvCy, eout(t)), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })
  }

  // Summary (scene 8)
  if (summaryOp > 0.01) {
    const rows = [
      { label: 'ACTION', sub: '.count()  →  triggers 1 Job',        rgb: DRV_RGB,        indent: 0 },
      { label: 'JOB',    sub: 'has N Stages  (sequential)',          rgb: DRV_RGB,        indent: 1 },
      { label: 'STAGE',  sub: 'has M Tasks  (parallel)',             rgb: EXE_COLORS[0],  indent: 2 },
      { label: 'TASK',   sub: '= 1 function × 1 partition',          rgb: EXE_COLORS[1],  indent: 3 },
      { label: 'SLOT',   sub: '= 1 CPU core on an Executor',         rgb: EXE_COLORS[2],  indent: 4 },
    ]
    const startY = H * 0.26, rowH = H * 0.128, indentPx = 14

    ctx.save()
    ctx.globalAlpha = summaryOp
    rows.forEach((row, i) => {
      const x = exeX + row.indent * indentPx
      const y = startY + i * rowH
      const [r, g, b] = row.rgb

      if (i > 0) {
        ctx.strokeStyle  = 'rgba(0,0,0,0.12)'
        ctx.lineWidth    = 1
        ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.moveTo(x - 6, y - rowH * 0.48)
        ctx.lineTo(x - 6, y + 3)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle    = `rgba(${r},${g},${b},0.9)`
      ctx.font         = '700 10px IBM Plex Mono, monospace'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(row.label, x, y + 6)

      ctx.fillStyle    = '#9099B5'
      ctx.font         = '400 9px IBM Plex Mono, monospace'
      ctx.fillText(row.sub, x + 54, y + 6)
    })
    ctx.restore()
  }

  return scene
}

export default function StagesTasks() {
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
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#9099B5', marginBottom: 9, textTransform: 'uppercase' }}>Este Job</div>
            {[
              { label: 'Stages',          value: '2',  color: '#1A2040' },
              { label: 'Tasks Stage 1',   value: '6',  color: '#D4580A' },
              { label: 'Tasks Stage 2',   value: '3',  color: '#1BAA6E' },
              { label: 'Slots / Executor', value: '2', color: '#1A2040' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: '#4B5680' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={scrubberRef}
        type="range" min="0" max="1000" defaultValue="0"
        style={{ width: '100%', accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }}
        onPointerDown={() => { wasPaused.current = !clock.current.playing; clock.current.playing = false; isDragging.current = true }}
        onInput={e => { clock.current.elapsed = (parseInt(e.target.value) / 1000) * TOTAL_MS; clock.current.startTs = null }}
        onPointerUp={() => { isDragging.current = false; if (!wasPaused.current) { clock.current.playing = true; clock.current.startTs = null; if (btnRef.current) btnRef.current.textContent = '⏸ pausar' } }}
      />

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button ref={btnRef} onClick={togglePlay}
          style={{ padding: '6px 16px', background: ACCENT, border: 'none', borderRadius: 3, color: 'white', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' }}>
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
