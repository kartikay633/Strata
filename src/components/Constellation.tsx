import { useEffect, useRef } from 'react'

/** Ambient animated node network — hints at "code as a graph". */
export default function Constellation({ density = 70, speed = 0.25 }: { density?: number; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }
    const colors = ['#8b7bff', '#38e1c6', '#ff7ab6', '#6aa8ff']
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; ph: number }
    let pts: P[] = []
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round((density * w * h) / (1400 * 900))
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed,
        r: Math.random() * 1.6 + 0.6, c: colors[Math.floor(Math.random() * colors.length)], ph: Math.random() * Math.PI * 2,
      }))
    }
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        if (!reduce) { p.x += p.vx; p.y += p.vy }
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy)
        if (d < 160) { p.x -= dx * 0.004; p.y -= dy * 0.004 }
      }
      const maxD = 130
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < maxD) {
            ctx.strokeStyle = `rgba(139,123,255,${(1 - d / maxD) * 0.22})`
            ctx.lineWidth = 0.7
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      for (const p of pts) {
        const pulse = 0.6 + 0.4 * Math.sin(t / 900 + p.ph)
        ctx.fillStyle = p.c
        ctx.globalAlpha = 0.5 + 0.5 * pulse
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.8 + pulse * 0.5), 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(tick)
    }
    resize()
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove) }
  }, [density, speed])
  return <canvas ref={ref} className="bg-canvas" style={{ width: '100%', height: '100%' }} />
}
