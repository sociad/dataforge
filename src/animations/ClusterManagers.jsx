import { useEffect, useRef } from 'react'

const TOTAL_MS = 27000
const CANVAS_H = 290

const CM_RGB  = [124, 68, 204]
const DRV_RGB = [24, 117, 204]
const DRV_HEX = '#1875CC'
const ACCENT  = '#7C44CC'

const EXE_COLORS = [
  [212, 88, 10],
  [27, 170, 110],
  [124, 68, 204],
]

const SCENES = [
  { title: 'Spark app arranca',        desc: 'Driver listo, Cluster Manager activo. Los workers existen pero sin recursos asignados todavía.' },
  { title: 'Driver pide recursos',      desc: 'El Driver negocia con el CM: cuántos executors necesita, cuánta RAM y cuántos cores cada uno.' },
  { title: 'CM inspecciona workers',    desc: 'El CM recorre los nodos del cluster para ver qué slots de CPU y memoria están libres.' },
  { title: 'CM asigna contenedores',   desc: 'El CM reserva contenedores en workers disponibles con exactamente los recursos solicitados.' },
  { title: 'Executors arrancan',        desc: 'Cada Executor levanta su JVM dentro del contenedor. Memoria reservada, slots de CPU disponibles.' },
  { title: 'Executors se registran',    desc: '"Estoy en W1, tengo 4 GB y 2 cores." Cada Executor se presenta directamente al Driver.' },
  { title: 'CM sale del loop',          desc: 'El rol del CM terminó. No participa en el envío de tasks ni conoce el DAG de ejecución.' },
  { title: 'Ejecución directa',         desc: 'Tasks van del Driver a los Executors sin pasar por el CM. El CM no sabe nada de las particiones.' },
  { title: 'YARN · K8s · Standalone',  desc: 'Tres implementaciones, un contrato: reservar y liberar contenedores para Spark.' },
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eout  = t            => 1 - (1 - t) ** 2
const lerp  = (a, b, t)   => a + (b - a) * t

function drawBox(ctx, x, y, w, h, rgb, op, label, sub) {
  if (op < 0.01) return
  const [r, g, b] = rgb
  ctx.save()
  ctx.globalAlpha = op
  ctx.fillStyle   = `rgba(${r},${g},${b},0.07)`
  ctx.fillRect(x, y, w, h)
  ctx.shadowBlur  = 10
  ctx.shadowColor = `rgba(${r},${g},${b},0.28)`
  ctx.strokeStyle = `rgba(${r},${g},${b},1)`
  ctx.lineWidth   = 1.5
  ctx.strokeRect(x, y, w, h)
  ctx.shadowBlur  = 0
  ctx.fillStyle   = `rgba(${r},${g},${b},0.9)`
  ctx.textAlign   = 'center'
  if (sub) {
    ctx.font         = `600 10px IBM Plex Mono, monospace`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(label, x + w / 2, y + h * 0.44)
    ctx.font      = `400 8px IBM Plex Mono, monospace`
    ctx.fillStyle = `rgba(${r},${g},${b},0.45)`
    ctx.textBaseline = 'top'
    ctx.fillText(sub, x + w / 2, y + h * 0.58)
  } else {
    ctx.font         = `600 10px IBM Plex Mono, monospace`
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
  }
  ctx.restore()
}

function drawArrow(ctx, x1, y1, x2, y2, t, rgb, op) {
  if (t < 0.01 || op < 0.01) return
  const [r, g, b] = rgb
  const tx = lerp(x1, x2, t)
  const ty = lerp(y1, y2, t)
  ctx.save()
  ctx.globalAlpha = op
  ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`
  ctx.lineWidth   = 1.5
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.setLineDash([])
  if (t > 0.75) {
    const ah    = 7
    const angle = Math.atan2(y2 - y1, x2 - x1)
    ctx.globalAlpha = op * ((t - 0.75) / 0.25)
    ctx.fillStyle   = `rgba(${r},${g},${b},0.8)`
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - ah * Math.cos(angle - 0.42), ty - ah * Math.sin(angle - 0.42))
    ctx.lineTo(tx - ah * Math.cos(angle + 0.42), ty - ah * Math.sin(angle + 0.42))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function drawDot(ctx, x, y, rgb, op) {
  if (op < 0.01) return
  const [r, g, b] = rgb
  ctx.save()
  ctx.globalAlpha = op
  ctx.shadowBlur  = 8
  ctx.shadowColor = `rgba(${r},${g},${b},0.7)`
  ctx.fillStyle   = `rgba(${r},${g},${b},0.9)`
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
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
  const cmW  = W * 0.42, cmH  = H * 0.17
  const cmX  = W / 2 - cmW / 2, cmY = H * 0.04
  const cmCx = W / 2

  const drvW  = W * 0.22, drvH  = H * 0.16
  const drvX  = W * 0.03, drvY  = H * 0.73
  const drvCx = drvX + drvW / 2, drvCy = drvY + drvH / 2

  const wW   = W * 0.14, wH   = H * 0.34
  const wTop = H * 0.38
  const wCxs = [W * 0.52, W * 0.70, W * 0.88]
  const wCy  = wTop + wH / 2

  // Progress values
  const initOp = eout(pg(p, 0, 0.07))

  const cmFade = scene <= 5 ? 1
    : scene === 6 ? 1 - eout(pg(p, 0.667, 0.740)) * 0.85
    : scene === 7 ? 0.15
    : eout(pg(p, 0.889, 0.950))
  const cmOp = initOp * cmFade

  const drvCmT  = eout(pg(p, 0.111, 0.200))
  const cmWkT   = wCxs.map((_, i) => eout(pg(p, 0.222 + i * 0.025, 0.310 + i * 0.025)))
  const wkOp    = wCxs.map((_, i) => eout(pg(p, 0.222 + i * 0.028, 0.295 + i * 0.028)))
  const contOp  = wCxs.map((_, i) => eout(pg(p, 0.333 + i * 0.025, 0.415 + i * 0.025)))
  const exeOp   = wCxs.map((_, i) => eout(pg(p, 0.444 + i * 0.025, 0.520 + i * 0.025)))
  const exDrvT  = wCxs.map((_, i) => eout(pg(p, 0.556 + i * 0.025, 0.640 + i * 0.025)))
  const directOp = scene >= 6 ? eout(pg(p, 0.667, 0.740)) : 0
  const dotOp   = scene === 7 ? eout(pg(p, 0.778, 0.830)) : 0
  const badgeOp = eout(pg(p, 0.889, 0.950))

  // CM box
  drawBox(ctx, cmX, cmY, cmW, cmH, CM_RGB, cmOp, 'CLUSTER MANAGER', null)

  // Driver box
  drawBox(ctx, drvX, drvY, drvW, drvH, DRV_RGB, initOp, 'DRIVER', 'coordina')

  // Driver→CM arrow (scene 1)
  if (drvCmT > 0.01) {
    drawArrow(ctx, drvCx, drvY, cmX + cmW * 0.22, cmY + cmH, drvCmT, DRV_RGB, initOp)
    if (drvCmT > 0.65) {
      const lo = (drvCmT - 0.65) / 0.35
      ctx.save()
      ctx.globalAlpha = lo * initOp
      ctx.fillStyle   = '#4B5680'
      ctx.font        = '400 9px IBM Plex Mono, monospace'
      ctx.textAlign   = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('resource request', drvX + drvW + 6, drvY - 10)
      ctx.restore()
    }
  }

  // CM→Worker arrows (scene 2)
  wCxs.forEach((cx, i) => {
    if (cmWkT[i] < 0.01) return
    const ax = cmX + cmW * (0.18 + i * 0.30)
    drawArrow(ctx, ax, cmY + cmH, cx, wTop, cmWkT[i], CM_RGB, cmOp)
  })

  // Worker boxes + containers + executors
  wCxs.forEach((cx, i) => {
    if (wkOp[i] < 0.01) return
    const wx = cx - wW / 2
    const [r, g, b] = EXE_COLORS[i]

    // Worker outer box
    ctx.save()
    ctx.globalAlpha = wkOp[i]
    ctx.fillStyle   = 'rgba(0,0,0,0.03)'
    ctx.fillRect(wx, wTop, wW, wH)
    ctx.strokeStyle = '#D2D7E8'
    ctx.lineWidth   = 1.5
    ctx.strokeRect(wx, wTop, wW, wH)
    ctx.fillStyle   = '#9099B5'
    ctx.font        = '500 8px IBM Plex Mono, monospace'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`WORKER ${i + 1}`, cx, wTop + 5)
    ctx.restore()

    // Container (dashed inner box, scene 3)
    if (contOp[i] > 0.01) {
      const pad = wW * 0.10
      const cW  = wW - pad * 2, cH = wH * 0.52
      const cX  = wx + pad,     cY = wTop + wH * 0.20
      ctx.save()
      ctx.globalAlpha = contOp[i] * wkOp[i]
      ctx.fillStyle   = `rgba(${r},${g},${b},0.05)`
      ctx.fillRect(cX, cY, cW, cH)
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`
      ctx.lineWidth   = 1
      ctx.strokeRect(cX, cY, cW, cH)
      ctx.setLineDash([])
      ctx.fillStyle   = `rgba(${r},${g},${b},0.4)`
      ctx.font        = '400 8px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('container', cx, cY + 3)
      ctx.restore()

      // Executor chip (scene 4)
      if (exeOp[i] > 0.01) {
        const eW = cW * 0.72, eH = cH * 0.45
        const eX = cx - eW / 2, eY = cY + cH * 0.38
        ctx.save()
        ctx.globalAlpha = exeOp[i] * wkOp[i]
        ctx.fillStyle   = `rgba(${r},${g},${b},0.13)`
        ctx.fillRect(eX, eY, eW, eH)
        ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`
        ctx.lineWidth   = 1.5
        ctx.strokeRect(eX, eY, eW, eH)
        ctx.fillStyle   = `rgba(${r},${g},${b},0.9)`
        ctx.font        = '600 9px IBM Plex Mono, monospace'
        ctx.textAlign   = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`EXE ${i + 1}`, cx, eY + eH / 2)
        ctx.restore()
      }
    }
  })

  // Exec→Driver arrows (scene 5)
  wCxs.forEach((cx, i) => {
    if (exDrvT[i] < 0.01) return
    drawArrow(ctx, cx, wCy, drvCx, drvCy, exDrvT[i], EXE_COLORS[i], wkOp[i])
  })

  // Direct connection lines (scene 6-7)
  if (directOp > 0.01) {
    wCxs.forEach((cx, i) => {
      const [r, g, b] = EXE_COLORS[i]
      ctx.save()
      ctx.globalAlpha = directOp * 0.30
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`
      ctx.lineWidth   = 1.5
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(drvCx, drvY)
      ctx.lineTo(cx, wCy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    })
  }

  // Task dots (scene 7)
  if (dotOp > 0.01) {
    const rawT = (p - 0.778) / 0.111
    wCxs.forEach((cx, i) => {
      const t = (Math.sin(rawT * Math.PI * 4 + i * 1.9) + 1) / 2
      drawDot(ctx, lerp(drvCx, cx, t), lerp(drvCy, wCy, t), EXE_COLORS[i], dotOp)
    })
  }

  // CM type badges (scene 8)
  if (badgeOp > 0.01) {
    const types = [
      { label: 'YARN',       line1: 'Hadoop',      line2: 'ResourceManager' },
      { label: 'K8s',        line1: 'Kubernetes',   line2: 'Pod-based' },
      { label: 'S/A',        line1: 'Standalone',   line2: 'built-in' },
    ]
    const gap  = 8
    const bW   = (cmW - gap * 2) / 3
    const bH   = H * 0.16
    const bY   = cmY + cmH + 10
    types.forEach((t, i) => {
      const bX = cmX + i * (bW + gap)
      ctx.save()
      ctx.globalAlpha = badgeOp
      ctx.fillStyle   = `rgba(${CM_RGB.join(',')},0.07)`
      ctx.fillRect(bX, bY, bW, bH)
      ctx.strokeStyle = `rgba(${CM_RGB.join(',')},0.30)`
      ctx.lineWidth   = 1
      ctx.strokeRect(bX, bY, bW, bH)
      ctx.fillStyle   = `rgba(${CM_RGB.join(',')},0.9)`
      ctx.font        = '700 10px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(t.label, bX + bW / 2, bY + 6)
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '400 8px IBM Plex Mono, monospace'
      ctx.fillText(t.line1, bX + bW / 2, bY + bH * 0.42)
      ctx.fillText(t.line2, bX + bW / 2, bY + bH * 0.65)
      ctx.restore()
    })
  }

  return scene
}

export default function ClusterManagers() {
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
              { label: 'Driver',     value: '1',    color: DRV_HEX },
              { label: 'Workers',    value: '3',    color: '#1A2040' },
              { label: 'Executors',  value: '3',    color: '#1A2040' },
              { label: 'CM types',   value: '3',    color: ACCENT },
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
