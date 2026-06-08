import { useEffect, useRef } from 'react'

const TOTAL_MS = 27000
const CANVAS_H = 290
const S        = 1 / 9

const DRV_RGB = [24,  117, 204]
const S0_RGB  = [212, 88,  10]
const S1_RGB  = [27,  170, 110]
const ACCENT  = '#1875CC'

const OPS = ['read', 'map', 'filter', 'groupBy', 'map', 'write']

const SCENES = [
  { title: 'El Job llega al Driver',           desc: 'Un Action (.write()) dispara un Job. El Driver recibe el plan lógico completo como un DAG de operaciones.' },
  { title: 'Narrow vs Wide',                   desc: 'El DAG Scheduler analiza cada transformación. Las narrow no mueven datos entre particiones; las wide sí — requieren shuffle.' },
  { title: 'DAG Scheduler corta Stages',       desc: 'El corte ocurre en las wide transformations. Stage 0 ejecuta primero; Stage 1 no puede empezar hasta que Stage 0 termine y el shuffle complete.' },
  { title: 'Stage 0: Tasks dispatched',        desc: 'Stage 0 tiene 4 particiones → 4 Tasks. El Task Scheduler los asigna a los 4 slots disponibles (2 Executors × 2 slots).' },
  { title: 'Tasks ejecutando en paralelo',     desc: 'Los 4 Tasks corren simultáneamente. Cada slot ejecuta 1 Task = 1 función aplicada a 1 partición.' },
  { title: 'Stage 0 completa · Shuffle Write', desc: 'Los 4 Tasks terminan. Shuffle write: cada Executor escribe sus datos particionados en disco local, listos para Stage 1.' },
  { title: 'Stage 1: Shuffle Read + Tasks',    desc: 'Stage 1 comienza con un shuffle read desde disco. 3 particiones post-shuffle → 3 Tasks. Un slot queda ocioso.' },
  { title: 'Stage 1 completa · Job done',      desc: 'Stage 1 termina. El Job completa. Duración total = Stage 0 + shuffle overhead + Stage 1. Los stages no se solapan.' },
  { title: 'Dos capas, dos responsabilidades', desc: 'DAG Scheduler: analiza el DAG, corta en Stages. Task Scheduler: toma cada Stage, crea Tasks, asigna a slots. Cada uno ignora al otro.' },
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pg    = (t, s, e)   => clamp((t - s) / (e - s), 0, 1)
const eout  = t            => 1 - (1 - t) ** 2
const lerp  = (a, b, t)   => a + (b - a) * t
const rgb   = arr          => arr.map(Math.round).join(',')

function drawSlot(ctx, x, y, w, h, col, op, procT, doneOp, label) {
  if (op < 0.01) return
  const [r, g, b] = col
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

  const scene = p < S ? 0 : p < 2*S ? 1 : p < 3*S ? 2 : p < 4*S ? 3 :
                p < 5*S ? 4 : p < 6*S ? 5 : p < 7*S ? 6 : p < 8*S ? 7 : 8

  // Layout
  const drvW = W * 0.13, drvH = H * 0.105
  const drvX = W * 0.02, drvY = H * 0.04
  const drvCx = drvX + drvW / 2, drvCy = drvY + drvH / 2

  const opW   = W * 0.085
  const opH   = H * 0.13
  const opGap = (W * 0.84 - 6 * opW) / 5
  const opXf  = i => W * 0.08 + i * (opW + opGap)
  const opCxf = i => opXf(i) + opW / 2
  const opY   = H * 0.44 - opH / 2

  const exeW  = W * 0.88, exeH = H * 0.195
  const exeX  = W * 0.06
  const exeY0 = H * 0.30
  const exeY1 = exeY0 + exeH + H * 0.035
  const exeYs = [exeY0, exeY1]

  const slotW = exeW * 0.155, slotH = exeH * 0.60
  const slotYo = (exeH - slotH) / 2
  const slotsX = exeX + exeW * 0.46
  const sx0    = slotsX - slotW - 5   // left slot x
  const sx1    = slotsX + 5           // right slot x

  // Progress vars
  const dagOp = scene <= 2 ? eout(pg(p, 0, S * 0.5))
              : scene === 3 ? 1 - eout(pg(p, S * 3, S * 3.35)) : 0

  const colorT  = eout(pg(p, S, S + S * 0.5))
  const labelOp = scene === 1 ? colorT
                : scene === 2 ? 1 - eout(pg(p, S * 2, S * 2.15)) : 0
  const boxOp   = scene >= 2  ? eout(pg(p, S * 2.2, S * 2.55)) : 0

  const exeOp = scene >= 3 && scene <= 7 ? eout(pg(p, S * 3, S * 3.4))
              : scene === 8              ? 1 - eout(pg(p, S * 8, S * 8.45)) : 0

  const s0HeadOp = (scene === 3 || scene === 4) ? eout(pg(p, S * 3, S * 3.3))
                 : scene === 5 ? 1 - eout(pg(p, S * 5, S * 5.4)) : 0
  const shHeadOp = scene === 5 ? eout(pg(p, S * 5, S * 5.3)) : 0
  const s1HeadOp = (scene === 6 || scene === 7) ? eout(pg(p, S * 6, S * 6.3))
                 : scene === 8 ? 1 - eout(pg(p, S * 8, S * 8.4)) : 0

  const s0Op    = (scene === 3 || scene === 4) ? eout(pg(p, S * 3.15, S * 3.5))
                : scene === 5 ? 1 - eout(pg(p, S * 5.2, S * 5.55)) : 0
  const s0ProcT = eout(pg(p, S * 4, S * 4.9))
  const s0Done  = eout(pg(p, S * 4.92, S * 5))

  const swOp = scene === 5 ? eout(pg(p, S * 5.05, S * 5.35)) : 0
  const swT  = pg(p, S * 5.1, S * 5.9)

  const srOp = scene === 6 ? eout(pg(p, S * 6, S * 6.3)) : 0
  const srT  = pg(p, S * 6.05, S * 6.55)

  const s1Op    = (scene === 6 || scene === 7) ? eout(pg(p, S * 6.35, S * 6.65))
                : scene === 8 ? 1 - eout(pg(p, S * 8, S * 8.45)) : 0
  const s1ProcT = eout(pg(p, S * 7, S * 7.9))
  const s1Done  = scene <= 7 ? eout(pg(p, S * 7.92, S * 8))
                : 1 - eout(pg(p, S * 8, S * 8.4))

  const resOp = scene >= 7 ? eout(pg(p, S * 7.92, S * 8)) : 0
  const resT  = pg(p, S * 7.95, S * 8.15)

  const sumOp = eout(pg(p, S * 8.2, S * 8.7))

  // ── Driver ────────────────────────────────────────────────────────────────
  const drvFade = eout(pg(p, 0, S * 0.4))
  if (drvFade > 0.01) {
    const [r, g, b] = DRV_RGB
    ctx.save()
    ctx.globalAlpha = drvFade
    ctx.fillStyle   = `rgba(${r},${g},${b},0.07)`
    ctx.fillRect(drvX, drvY, drvW, drvH)
    ctx.shadowBlur  = 8
    ctx.shadowColor = `rgba(${r},${g},${b},0.30)`
    ctx.strokeStyle = `rgba(${r},${g},${b},1)`
    ctx.lineWidth   = 1.5
    ctx.strokeRect(drvX, drvY, drvW, drvH)
    ctx.shadowBlur  = 0
    ctx.fillStyle   = `rgba(${r},${g},${b},0.90)`
    ctx.font        = '600 9px IBM Plex Mono, monospace'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DRIVER', drvCx, drvCy)
    ctx.restore()
  }

  // Job label (scene 0 → fade out in scene 1)
  const jobOp = scene === 0 ? eout(pg(p, S * 0.1, S * 0.5))
              : scene === 1 ? 1 - eout(pg(p, S, S + S * 0.3)) : 0
  if (jobOp > 0.01) {
    ctx.save()
    ctx.globalAlpha = jobOp
    ctx.fillStyle   = '#1875CC'
    ctx.font        = '500 10px IBM Plex Mono, monospace'
    ctx.textAlign   = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('.write()', drvX + drvW + 9, drvCy - 5)
    ctx.fillStyle   = '#4B5680'
    ctx.font        = '400 9px IBM Plex Mono, monospace'
    ctx.fillText('→  JOB #1', drvX + drvW + 9, drvCy + 7)
    ctx.restore()
  }

  // ── DAG ops (scenes 0-2) ─────────────────────────────────────────────────
  if (dagOp > 0.01) {
    const grey   = [144, 153, 181]
    const narrow = [27,  170, 110]
    const wide   = [212, 88,  10]

    OPS.forEach((label, i) => {
      const target = i === 3 ? wide : narrow
      const col    = grey.map((g, idx) => lerp(g, target[idx], colorT))
      const x      = opXf(i)

      ctx.save()
      ctx.globalAlpha = dagOp
      ctx.fillStyle   = `rgba(${rgb(col)},0.10)`
      ctx.fillRect(x, opY, opW, opH)
      ctx.strokeStyle = `rgba(${rgb(col)},0.65)`
      ctx.lineWidth   = 1
      ctx.strokeRect(x, opY, opW, opH)
      ctx.fillStyle   = `rgba(${rgb(col)},0.90)`
      ctx.font        = '500 8px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + opW / 2, opY + opH / 2)
      ctx.restore()

      if (i < 5) {
        const ax1 = opXf(i) + opW + 2, ax2 = opXf(i + 1) - 2, ay = opY + opH / 2
        ctx.save()
        ctx.globalAlpha = dagOp * 0.40
        ctx.strokeStyle = '#9099B5'
        ctx.lineWidth   = 1
        ctx.beginPath(); ctx.moveTo(ax1, ay); ctx.lineTo(ax2 - 5, ay); ctx.stroke()
        ctx.fillStyle   = '#9099B5'
        ctx.beginPath()
        ctx.moveTo(ax2, ay); ctx.lineTo(ax2 - 5, ay - 3); ctx.lineTo(ax2 - 5, ay + 3)
        ctx.closePath(); ctx.fill()
        ctx.restore()
      }
    })

    // narrow / wide labels (scene 1)
    if (labelOp > 0.01) {
      ctx.save()
      ctx.globalAlpha = dagOp * labelOp
      ctx.font         = '400 8px IBM Plex Mono, monospace'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle    = 'rgba(27,170,110,0.80)'
      ctx.fillText('narrow', opCxf(1), opY + opH + 6)
      ctx.fillStyle    = 'rgba(212,88,10,0.80)'
      ctx.fillText('wide', opCxf(3), opY + opH + 6)
      ctx.restore()
    }

    // Stage boxes + boundary (scene 2)
    if (boxOp > 0.01) {
      const pad  = 6
      const bx0  = opXf(0) - pad, bx0e = opXf(2) + opW + pad
      const bx1  = opXf(3) - pad, bx1e = opXf(5) + opW + pad
      const by   = opY - 14,      bh   = opH + 20
      const midX = (opXf(2) + opW + opXf(3)) / 2

      ctx.save()
      ctx.globalAlpha = dagOp * boxOp

      const [s0r, s0g, s0b] = S0_RGB
      ctx.strokeStyle = `rgba(${s0r},${s0g},${s0b},0.65)`
      ctx.lineWidth   = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(bx0, by, bx0e - bx0, bh)
      ctx.setLineDash([])
      ctx.fillStyle   = `rgba(${s0r},${s0g},${s0b},0.80)`
      ctx.font        = '600 8px IBM Plex Mono, monospace'
      ctx.textAlign   = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText('STAGE 0', bx0 + 3, by)

      const [s1r, s1g, s1b] = S1_RGB
      ctx.strokeStyle = `rgba(${s1r},${s1g},${s1b},0.65)`
      ctx.setLineDash([4, 3])
      ctx.strokeRect(bx1, by, bx1e - bx1, bh)
      ctx.setLineDash([])
      ctx.fillStyle   = `rgba(${s1r},${s1g},${s1b},0.80)`
      ctx.textAlign   = 'right'
      ctx.fillText('STAGE 1', bx1e - 3, by)

      ctx.strokeStyle = 'rgba(144,153,181,0.55)'
      ctx.lineWidth   = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath(); ctx.moveTo(midX, by - 6); ctx.lineTo(midX, by + bh + 14); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '400 8px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('shuffle', midX, by + bh + 4)

      ctx.restore()
    }
  }

  // ── Stage header ──────────────────────────────────────────────────────────
  const drawHeader = (label, col, sub, op) => {
    if (op < 0.01) return
    const [r, g, b] = col
    ctx.save()
    ctx.globalAlpha  = op
    ctx.fillStyle    = `rgba(${r},${g},${b},0.85)`
    ctx.font         = '700 10px IBM Plex Mono, monospace'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, exeX, H * 0.21)
    ctx.fillStyle    = '#9099B5'
    ctx.font         = '400 9px IBM Plex Mono, monospace'
    ctx.textAlign    = 'right'
    ctx.fillText(sub, exeX + exeW, H * 0.21)
    ctx.restore()
  }
  drawHeader('STAGE 0',       S0_RGB, '4 tasks · 2 slots / executor', s0HeadOp)
  drawHeader('SHUFFLE WRITE', S0_RGB, 'writing partitioned data to disk...', shHeadOp)
  drawHeader('STAGE 1',       S1_RGB, '3 tasks · 2 slots / executor', s1HeadOp)

  // ── Executor boxes ────────────────────────────────────────────────────────
  if (exeOp > 0.01) {
    exeYs.forEach((ey, i) => {
      ctx.save()
      ctx.globalAlpha = exeOp
      ctx.fillStyle   = 'rgba(0,0,0,0.025)'
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

  // ── Stage 0 slots ─────────────────────────────────────────────────────────
  if (s0Op > 0.01) {
    exeYs.forEach((ey, ei) => {
      const sy = ey + slotYo
      drawSlot(ctx, sx0, sy, slotW, slotH, S0_RGB, s0Op, s0ProcT, s0Done, `P${ei * 2}`)
      drawSlot(ctx, sx1, sy, slotW, slotH, S0_RGB, s0Op, s0ProcT, s0Done, `P${ei * 2 + 1}`)
    })
  }

  // ── Shuffle write dots (scene 5) ──────────────────────────────────────────
  if (swOp > 0.01) {
    const diskY  = H * 0.91
    const srcXs  = [sx0 + slotW / 2, sx1 + slotW / 2, sx0 + slotW / 2, sx1 + slotW / 2]
    const srcYs  = [exeYs[0] + exeH / 2, exeYs[0] + exeH / 2,
                    exeYs[1] + exeH / 2, exeYs[1] + exeH / 2]
    const dstXs  = [W * 0.22, W * 0.38, W * 0.54, W * 0.70]
    const [r, g, b] = S0_RGB

    dstXs.forEach((dx, i) => {
      const t = clamp(swT * 1.4 - i * 0.10, 0, 1)
      if (t < 0.01) return
      ctx.save()
      ctx.globalAlpha = swOp * 0.85
      ctx.fillStyle   = `rgba(${r},${g},${b},0.75)`
      ctx.shadowBlur  = 5
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`
      ctx.beginPath()
      ctx.arc(lerp(srcXs[i], dx, eout(t)), lerp(srcYs[i], diskY, eout(t)), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    if (swT > 0.2) {
      ctx.save()
      ctx.globalAlpha = swOp * Math.min(1, (swT - 0.2) * 3)
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '400 8px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('shuffle files on disk', W / 2, diskY + 11)
      ctx.restore()
    }
  }

  // ── Shuffle read dots (scene 6) ───────────────────────────────────────────
  if (srOp > 0.01) {
    const diskY = H * 0.91
    const srcXs = [W * 0.25, W * 0.45, W * 0.65]
    const dstXs = [sx0 + slotW / 2, sx1 + slotW / 2, sx0 + slotW / 2]
    const dstYs = [exeYs[0] + exeH / 2, exeYs[0] + exeH / 2, exeYs[1] + exeH / 2]
    const [r, g, b] = S1_RGB

    dstXs.forEach((dx, i) => {
      const t = clamp(srT * 1.4 - i * 0.10, 0, 1)
      if (t < 0.01) return
      ctx.save()
      ctx.globalAlpha = srOp * (0.4 + t * 0.6)
      ctx.fillStyle   = `rgba(${r},${g},${b},0.75)`
      ctx.shadowBlur  = 5
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`
      ctx.beginPath()
      ctx.arc(lerp(srcXs[i], dx, eout(t)), lerp(diskY, dstYs[i], eout(t)), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    ctx.save()
    ctx.globalAlpha = srOp * Math.max(0, 1 - srT * 2)
    ctx.fillStyle   = '#9099B5'
    ctx.font        = '400 8px IBM Plex Mono, monospace'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('shuffle files on disk', W / 2, diskY + 11)
    ctx.restore()
  }

  // ── Stage 1 slots ─────────────────────────────────────────────────────────
  if (s1Op > 0.01) {
    drawSlot(ctx, sx0, exeYs[0] + slotYo, slotW, slotH, S1_RGB, s1Op, s1ProcT, s1Done, "P0'")
    drawSlot(ctx, sx1, exeYs[0] + slotYo, slotW, slotH, S1_RGB, s1Op, s1ProcT, s1Done, "P1'")
    drawSlot(ctx, sx0, exeYs[1] + slotYo, slotW, slotH, S1_RGB, s1Op, s1ProcT, s1Done, "P2'")

    // Idle slot (exe1 / slot1)
    const idleOp = s1Op * eout(pg(p, S * 7, S * 7.3))
    if (idleOp > 0.01) {
      ctx.save()
      ctx.globalAlpha = idleOp * 0.28
      ctx.strokeStyle = '#D2D7E8'
      ctx.lineWidth   = 1
      ctx.setLineDash([2, 3])
      ctx.strokeRect(sx1, exeYs[1] + slotYo, slotW, slotH)
      ctx.setLineDash([])
      ctx.fillStyle   = '#9099B5'
      ctx.font        = '400 7px IBM Plex Mono, monospace'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('idle', sx1 + slotW / 2, exeYs[1] + slotYo + slotH / 2)
      ctx.restore()
    }
  }

  // ── Result dots → Driver (scene 7+) ──────────────────────────────────────
  if (resOp > 0.01) {
    const srcXs = [sx0 + slotW / 2, sx1 + slotW / 2, sx0 + slotW / 2]
    const srcYs = [exeYs[0] + exeH / 2, exeYs[0] + exeH / 2, exeYs[1] + exeH / 2]
    const [r, g, b] = DRV_RGB

    srcXs.forEach((sx, i) => {
      const t = clamp(resT * 1.5 - i * 0.20, 0, 1)
      if (t < 0.01) return
      ctx.save()
      ctx.globalAlpha = resOp * eout(t)
      ctx.fillStyle   = `rgba(${r},${g},${b},0.85)`
      ctx.shadowBlur  = 7
      ctx.shadowColor = `rgba(${r},${g},${b},0.6)`
      ctx.beginPath()
      ctx.arc(lerp(sx, drvCx, eout(t)), lerp(srcYs[i], drvCy, eout(t)), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })
  }

  // ── Summary (scene 8) ─────────────────────────────────────────────────────
  if (sumOp > 0.01) {
    const cols = [
      {
        label: 'DAG SCHEDULER',
        col:   S0_RGB,
        items: ['analiza el DAG lógico', 'detecta wide transformations', 'corta el DAG en Stages', 'gestiona deps entre Stages'],
        note:  'no ve Executors ni slots',
      },
      {
        label: 'TASK SCHEDULER',
        col:   S1_RGB,
        items: ['recibe Stages del DAG Sched.', 'crea 1 Task por partición', 'asigna Tasks a slots libres', 'prefiere localidad de datos'],
        note:  'no ve la estructura del DAG',
      },
    ]
    const colW = W * 0.41, colH = H * 0.70, colY = H * 0.15
    const col0X = exeX, col1X = col0X + colW + W * 0.07

    ctx.save()
    ctx.globalAlpha = sumOp

    cols.forEach((col, ci) => {
      const cx = ci === 0 ? col0X : col1X
      const [r, g, b] = col.col
      ctx.fillStyle   = `rgba(${r},${g},${b},0.07)`
      ctx.fillRect(cx, colY, colW, colH)
      ctx.strokeStyle = `rgba(${r},${g},${b},0.40)`
      ctx.lineWidth   = 1
      ctx.strokeRect(cx, colY, colW, colH)
      ctx.fillStyle    = `rgba(${r},${g},${b},0.90)`
      ctx.font         = '700 9px IBM Plex Mono, monospace'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(col.label, cx + 8, colY + 8)
      col.items.forEach((item, ii) => {
        ctx.fillStyle    = '#4B5680'
        ctx.font         = '400 8px IBM Plex Mono, monospace'
        ctx.textBaseline = 'top'
        ctx.fillText(`· ${item}`, cx + 8, colY + 26 + ii * 14)
      })
      ctx.fillStyle    = `rgba(${r},${g},${b},0.55)`
      ctx.font         = '400 8px IBM Plex Mono, monospace'
      ctx.textBaseline = 'bottom'
      ctx.fillText(col.note, cx + 8, colY + colH - 8)
    })

    const arrX = col0X + colW + 4, arrE = col1X - 4, arrY = colY + colH / 2
    ctx.strokeStyle = '#9099B5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(arrX, arrY); ctx.lineTo(arrE - 6, arrY); ctx.stroke()
    ctx.fillStyle = '#9099B5'
    ctx.beginPath()
    ctx.moveTo(arrE, arrY); ctx.lineTo(arrE - 6, arrY - 3); ctx.lineTo(arrE - 6, arrY + 3)
    ctx.closePath(); ctx.fill()

    ctx.restore()
  }

  return scene
}

export default function DAGScheduler() {
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)
  const clock       = useRef({ playing: true, startTs: null, elapsed: 0 })
  const titleRef    = useRef(null)
  const descRef     = useRef(null)
  const fadeRef     = useRef(null)
  const btnRef      = useRef(null)
  const scrubRef    = useRef(null)
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
      const p     = (c.elapsed % TOTAL_MS) / TOTAL_MS
      const scene = drawFrame(canvas.getContext('2d'), W, p)

      if (!isDragging.current && scrubRef.current)
        scrubRef.current.value = String(Math.floor(p * 1000))

      if (scene !== prevScene.current) {
        const target = scene
        prevScene.current = target
        const el = fadeRef.current
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
    return () => { cancelAnimationFrame(rafRef.current); timers.current.forEach(clearTimeout) }
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
            <div ref={fadeRef} style={{ position: 'absolute', inset: 0, padding: '13px 14px', opacity: 1 }}>
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
              { label: 'Stages',              value: '2',  color: '#1A2040' },
              { label: 'Tasks Stage 0',       value: '4',  color: '#D4580A' },
              { label: 'Tasks Stage 1',       value: '3',  color: '#1BAA6E' },
              { label: 'Slots disponibles',   value: '4',  color: '#1A2040' },
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
        ref={scrubRef}
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
