import { useEffect, useRef } from 'react'

const TOTAL_MS = 27000
const CANVAS_H = 280   // height fija — evita dependencia circular en flex

const DRV_RGB = [24, 117, 204]
const DRV_HEX = '#1875CC'
const EXE = [
  { rgb: [212, 88, 10],  hex: '#D4580A' },
  { rgb: [27, 170, 110], hex: '#1BAA6E' },
  { rgb: [124, 68, 204], hex: '#7C44CC' },
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eout  = t            => 1 - (1 - t) ** 2
const lerp  = (a, b, t)   => a + (b - a) * t

const SCENES = [
  { title: 'Dataset sin particionar',  desc: 'Los datos viven en almacenamiento distribuido (S3, HDFS). Spark todavía no hizo nada.' },
  { title: 'Driver arranca',           desc: 'Exactamente un Driver por aplicación. Corre tu código y construye el plan de ejecución.' },
  { title: 'Executors asignados',      desc: 'El Cluster Manager (YARN, Kubernetes) lanza N Executors en los nodos del cluster.' },
  { title: 'Red de comunicación',      desc: 'El Driver mantiene conexión directa con cada Executor durante toda la vida de la aplicación.' },
  { title: 'Datos particionados',      desc: 'El dataset se divide en particiones. Cada Executor procesa sus propias particiones.' },
  { title: 'Tasks: una por partición', desc: 'El Driver envía Tasks — unidades de trabajo. Un Task = la operación sobre una partición.' },
  { title: 'Procesamiento paralelo',   desc: 'Los tres Executors trabajan simultáneamente, sin coordinarse entre ellos.' },
  { title: 'Resultados al Driver',     desc: '.show() devuelve N filas. .collect() trae TODO — cuidado con el tamaño del dataset.' },
  { title: '1 Driver · N Executors',   desc: 'El Driver coordina y nunca toca datos. Los Executors procesan y nunca planifican.' },
]

function computeFrame(p, W) {
  const H    = CANVAS_H
  const drvW = W * 0.24
  const drvH = Math.max(44, H * 0.16)
  const exeW = W * 0.20
  const exeH = Math.max(44, H * 0.16)
  const drvX = W / 2
  const drvY = H * 0.30
  const exeY = H * 0.78
  // executors usan 14–86% del ancho para llenar bien el canvas
  const exeXs = [W * 0.14, W * 0.50, W * 0.86]

  const scene =
    p < 0.111 ? 0 : p < 0.222 ? 1 : p < 0.333 ? 2 :
    p < 0.444 ? 3 : p < 0.556 ? 4 : p < 0.667 ? 5 :
    p < 0.778 ? 6 : p < 0.889 ? 7 : 8

  const datasetOp = p < 0.16
    ? eout(pg(p, 0, 0.07))
    : 1 - eout(pg(p, 0.16, 0.25))

  const driverOp = eout(pg(p, 0.111, 0.190))

  const exeOps = exeXs.map((_, i) =>
    eout(pg(p, 0.222 + i * 0.028, 0.300 + i * 0.028))
  )

  const lineProg = exeXs.map((_, i) =>
    eout(pg(p, 0.333 + i * 0.018, 0.405 + i * 0.018))
  )

  const partOps = exeXs.map((_, i) =>
    eout(pg(p, 0.444 + i * 0.018, 0.505 + i * 0.018))
  )

  const taskT = exeXs.map((_, i) =>
    pg(p, 0.556 + i * 0.020, 0.638 + i * 0.020)
  )

  const procT = exeXs.map(() => pg(p, 0.667, 0.762))

  const resultT = exeXs.map((_, i) =>
    pg(p, 0.778 + i * 0.020, 0.860 + i * 0.020)
  )

  return {
    scene,
    drvX, drvY, drvW, drvH,
    exeXs, exeY, exeW, exeH,
    datasetOp, driverOp, exeOps,
    lineProg, partOps, taskT, procT, resultT,
  }
}

function drawBox(ctx, x, y, w, h, rgb, op, topLabel, botLabel) {
  const [r, g, b] = rgb
  const fs = Math.max(10, Math.round(w * 0.092))
  ctx.save()
  ctx.globalAlpha = op

  ctx.fillStyle = `rgba(${r},${g},${b},0.07)`
  ctx.fillRect(x, y, w, h)

  ctx.shadowBlur  = 14
  ctx.shadowColor = `rgba(${r},${g},${b},0.28)`
  ctx.strokeStyle = `rgba(${r},${g},${b},1)`
  ctx.lineWidth   = 1.5
  ctx.strokeRect(x, y, w, h)
  ctx.shadowBlur  = 0

  ctx.fillStyle    = `rgba(${r},${g},${b},0.9)`
  ctx.font         = `500 ${fs}px IBM Plex Mono, monospace`
  ctx.textAlign    = 'center'
  ctx.textBaseline = botLabel ? 'alphabetic' : 'middle'
  ctx.fillText(topLabel, x + w / 2, botLabel ? y + h / 2 - 1 : y + h / 2)

  if (botLabel) {
    const subFs = Math.max(8, fs - 3)
    ctx.font         = `400 ${subFs}px IBM Plex Mono, monospace`
    ctx.fillStyle    = `rgba(${r},${g},${b},0.45)`
    ctx.textBaseline = 'top'
    ctx.fillText(botLabel, x + w / 2, y + h / 2 + 3)
  }

  ctx.restore()
}

function drawDot(ctx, x, y, rgb) {
  const [r, g, b] = rgb
  ctx.save()
  ctx.shadowBlur  = 10
  ctx.shadowColor = `rgba(${r},${g},${b},0.7)`
  ctx.fillStyle   = `rgba(${r},${g},${b},0.95)`
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawFrame(ctx, W, f) {
  const H = CANVAS_H
  const { drvX, drvY, drvW, drvH, exeXs, exeY, exeW, exeH } = f
  ctx.clearRect(0, 0, W, H)

  // Dataset block
  if (f.datasetOp > 0.01) {
    ctx.save()
    ctx.globalAlpha = f.datasetOp
    const bw = W * 0.38, bh = H * 0.12
    const bx = W / 2 - bw / 2, by = H * 0.06
    ctx.fillStyle = 'rgba(0,0,0,0.04)'
    ctx.fillRect(bx, by, bw, bh)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, bw, bh)
    ctx.setLineDash([])
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(bx, by + i * (bh / 4))
      ctx.lineTo(bx + bw, by + i * (bh / 4))
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    const fds = Math.max(10, Math.round(bw * 0.048))
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.font = `500 ${fds}px IBM Plex Mono, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DATASET', W / 2, by + bh / 2)
    ctx.restore()
  }

  // Connection lines
  exeXs.forEach((ex, i) => {
    if (f.lineProg[i] < 0.01) return
    const x1 = drvX, y1 = drvY + drvH / 2
    const x2 = ex,   y2 = exeY - exeH / 2
    ctx.save()
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = `rgba(${EXE[i].rgb.join(',')},0.22)`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(lerp(x1, x2, f.lineProg[i]), lerp(y1, y2, f.lineProg[i]))
    ctx.stroke()
    ctx.restore()
  })

  // Driver box
  if (f.driverOp > 0.01)
    drawBox(ctx, drvX - drvW / 2, drvY - drvH / 2, drvW, drvH, DRV_RGB, f.driverOp, 'DRIVER', 'coordina')

  // Executor boxes
  exeXs.forEach((ex, i) => {
    if (f.exeOps[i] < 0.01) return
    drawBox(ctx, ex - exeW / 2, exeY - exeH / 2, exeW, exeH, EXE[i].rgb, f.exeOps[i], `EXECUTOR ${i + 1}`, null)

    // Partition block
    if (f.partOps[i] > 0.01) {
      ctx.save()
      ctx.globalAlpha = f.partOps[i] * f.exeOps[i]
      const pw = exeW * 0.46, ph = Math.max(10, exeH * 0.22)
      const px = ex - pw / 2, py = exeY - exeH / 2 + 4
      ctx.fillStyle   = `rgba(${EXE[i].rgb.join(',')},0.18)`
      ctx.fillRect(px, py, pw, ph)
      ctx.strokeStyle = `rgba(${EXE[i].rgb.join(',')},0.45)`
      ctx.lineWidth   = 0.75
      ctx.strokeRect(px, py, pw, ph)
      const pf = Math.max(8, Math.round(pw * 0.16))
      ctx.fillStyle    = `rgba(${EXE[i].rgb.join(',')},0.8)`
      ctx.font         = `500 ${pf}px IBM Plex Mono, monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`P${i + 1}`, ex, py + ph / 2)
      ctx.restore()
    }

    // Processing bar
    if (f.procT[i] > 0.01) {
      ctx.save()
      ctx.globalAlpha = f.exeOps[i]
      const bx = ex - exeW / 2 + 6, by2 = exeY + exeH / 2 - 12
      const bw = exeW - 12, bh = 5
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      ctx.fillRect(bx, by2, bw, bh)
      ctx.fillStyle = `rgba(${EXE[i].rgb.join(',')},0.65)`
      ctx.fillRect(bx, by2, bw * f.procT[i], bh)
      ctx.restore()
    }
  })

  // Task dots (Driver → Executor)
  exeXs.forEach((ex, i) => {
    const t = f.taskT[i]
    if (t <= 0 || t >= 1) return
    drawDot(ctx,
      lerp(drvX, ex, t),
      lerp(drvY + drvH / 2, exeY - exeH / 2, t),
      EXE[i].rgb
    )
  })

  // Result dots (Executor → Driver)
  exeXs.forEach((ex, i) => {
    const t = f.resultT[i]
    if (t <= 0 || t >= 1) return
    drawDot(ctx,
      lerp(ex, drvX, t),
      lerp(exeY - exeH / 2, drvY + drvH / 2, t),
      DRV_RGB
    )
  })
}

export default function DriverExecutors() {
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)
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
    const W = wrapRef.current.clientWidth
    canvas.width  = W
    canvas.height = CANVAS_H

    const tick = (ts) => {
      const c = clock.current
      if (c.playing) {
        if (!c.startTs) c.startTs = ts - c.elapsed
        c.elapsed = ts - c.startTs
      }
      const p = (c.elapsed % TOTAL_MS) / TOTAL_MS
      const f = computeFrame(p, W)

      drawFrame(canvas.getContext('2d'), W, f)

      if (!isDragging.current && scrubberRef.current)
        scrubberRef.current.value = String(Math.floor(p * 1000))

      if (f.scene !== prevScene.current) {
        const target = f.scene
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', fontFamily: "'IBM Plex Mono', monospace" }}>

      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>

        {/* Canvas — width: 100% asegura que ocupe todo el espacio disponible */}
        <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
        </div>

        {/* Info panel */}
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
              { label: 'Driver',      value: '1', color: DRV_HEX },
              { label: 'Executors',   value: '3', color: '#1A2040' },
              { label: 'Particiones', value: '3', color: '#1A2040' },
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
        style={{ width: '100%', accentColor: DRV_HEX, cursor: 'pointer', flexShrink: 0 }}
        onPointerDown={() => { wasPaused.current = !clock.current.playing; clock.current.playing = false; isDragging.current = true }}
        onInput={e => { clock.current.elapsed = (parseInt(e.target.value) / 1000) * TOTAL_MS; clock.current.startTs = null }}
        onPointerUp={() => { isDragging.current = false; if (!wasPaused.current) { clock.current.playing = true; clock.current.startTs = null; if (btnRef.current) btnRef.current.textContent = '⏸ pausar' } }}
      />

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button ref={btnRef} onClick={togglePlay} style={{ padding: '6px 16px', background: DRV_HEX, border: 'none', borderRadius: 3, color: 'white', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' }}>
          ⏸ pausar
        </button>
        <button onClick={restart} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #D2D7E8', borderRadius: 3, color: '#6B7592', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, cursor: 'pointer' }}>
          ↺ reiniciar
        </button>
      </div>
    </div>
  )
}
