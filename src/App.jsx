import { useEffect, useRef, useState } from 'react'
import './App.css'

const WIDTH = 900
const HEIGHT = 500
const GROUND = 420
const GRAVITY = 0.75
const JUMP_VELOCITY = -17
const STAND_HEIGHT = 62
const SLIDE_HEIGHT = 30
const PLAYER_X = 150
const PLAYER_W = 46
const HIT_DAMAGE = 20
const HEALTH_DRAIN_PER_SEC = 100 / 60

function createGame() {
  return {
    phase: 'start',
    player: {
      x: PLAYER_X,
      w: PLAYER_W,
      h: STAND_HEIGHT,
      y: GROUND - STAND_HEIGHT,
      vy: 0,
      sliding: false,
      airborne: false,
      invincible: 0,
    },
    obstacles: [],
    speed: 6,
    health: 100,
    score: 0,
    distance: 0,
    spawnTimer: 40,
    groundOffset: 0,
    bgOffset: 0,
  }
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const keysRef = useRef({ down: false })
  const actionsRef = useRef({})
  const [screen, setScreen] = useState('start')
  const [finalScore, setFinalScore] = useState(0)
  const [bestScore, setBestScore] = useState(() =>
    Number(localStorage.getItem('cookierun-best') || 0),
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const g = createGame()
    gameRef.current = g
    let raf
    let last = performance.now()

    const start = () => {
      const fresh = createGame()
      Object.assign(g, fresh)
      g.phase = 'playing'
      setScreen('playing')
    }

    const jump = () => {
      const p = g.player
      if (g.phase !== 'playing') return
      if (p.airborne) return
      p.sliding = false
      p.h = STAND_HEIGHT
      p.y = GROUND - STAND_HEIGHT
      p.vy = JUMP_VELOCITY
      p.airborne = true
    }

    const gameOver = () => {
      g.phase = 'over'
      const s = Math.floor(g.score)
      setFinalScore(s)
      setBestScore((prev) => {
        const best = Math.max(prev, s)
        localStorage.setItem('cookierun-best', String(best))
        return best
      })
      setScreen('over')
    }

    actionsRef.current = { start, jump }

    const spawn = () => {
      const type = Math.random() < 0.5 ? 'jump' : 'slide'
      const x = WIDTH + 40
      if (type === 'jump') {
        g.obstacles.push({ type, x, y: GROUND - 48, w: 38, h: 48, passed: false })
      } else {
        g.obstacles.push({ type, x, y: 0, w: 32, h: GROUND - 34, passed: false })
      }
    }

    const update = (dt) => {
      const p = g.player

      if (keysRef.current.down) {
        if (!p.airborne) {
          if (!p.sliding) {
            p.sliding = true
            p.h = SLIDE_HEIGHT
            p.y = GROUND - SLIDE_HEIGHT
          }
        } else {
          p.vy += 1.1
        }
      } else if (p.sliding && !p.airborne) {
        p.sliding = false
        p.h = STAND_HEIGHT
        p.y = GROUND - STAND_HEIGHT
      }

      if (p.airborne) {
        p.vy += GRAVITY
        p.y += p.vy
        if (p.y >= GROUND - p.h) {
          p.y = GROUND - p.h
          p.airborne = false
          p.vy = 0
        }
      }

      if (p.invincible > 0) p.invincible -= dt

      g.speed = Math.min(6 + g.distance / 700, 14)
      g.distance += g.speed * dt
      g.score += g.speed * dt * 0.08
      g.health -= (HEALTH_DRAIN_PER_SEC / 60) * dt
      if (g.health <= 0) {
        g.health = 0
        gameOver()
        return
      }

      g.groundOffset = (g.groundOffset + g.speed * dt) % 40
      g.bgOffset = (g.bgOffset + g.speed * dt * 0.4) % WIDTH

      g.spawnTimer -= dt
      if (g.spawnTimer <= 0) {
        spawn()
        g.spawnTimer = 55 + Math.random() * 45
      }

      for (const o of g.obstacles) {
        o.x -= g.speed * dt
      }
      g.obstacles = g.obstacles.filter((o) => o.x + o.w > 0)

      const playerRect = { x: p.x, y: p.y, w: p.w, h: p.h }
      for (const o of g.obstacles) {
        const rect = { x: o.x, y: o.y, w: o.w, h: o.h }
        if (!o.passed && o.x + o.w < p.x) {
          o.passed = true
          g.score += 10
        }
        if (aabb(playerRect, rect)) {
          if (p.invincible <= 0) {
            g.health -= HIT_DAMAGE
            p.invincible = 60
            if (g.health <= 0) {
              g.health = 0
              gameOver()
              return
            }
          }
        }
      }
    }

    const drawCookie = (p, cx, cy, h) => {
      const squash = h / STAND_HEIGHT
      ctx.fillStyle = '#c97b3d'
      ctx.beginPath()
      ctx.ellipse(cx, cy, p.w / 2, (p.w / 2) * squash * 0.78, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#7a4a1f'
      for (const [dx, dy] of [
        [-0.35, -0.15],
        [0.3, -0.3],
        [0.15, 0.25],
        [-0.1, 0.3],
      ]) {
        ctx.beginPath()
        ctx.arc(cx + dx * p.w, cy + dy * p.w * squash, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#2b2b2b'
      ctx.beginPath()
      ctx.arc(cx - 8, cy - 6, 3.5, 0, Math.PI * 2)
      ctx.arc(cx + 8, cy - 6, 3.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#2b2b2b'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy + 2, 8, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
    }

    const draw = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND)
      sky.addColorStop(0, '#8ed4ff')
      sky.addColorStop(1, '#dff2ff')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, WIDTH, GROUND)

      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (let i = 0; i < 4; i++) {
        const x = ((i * 220 - g.bgOffset) % (WIDTH + 220) + WIDTH + 220) % (WIDTH + 220) - 110
        ctx.beginPath()
        ctx.ellipse(x, 90 + (i % 2) * 60, 55, 20, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#7ec850'
      ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND)
      ctx.fillStyle = '#6ab544'
      ctx.fillRect(0, GROUND, WIDTH, 6)
      ctx.fillStyle = '#5a9e38'
      for (let x = -g.groundOffset; x < WIDTH + 40; x += 40) {
        ctx.fillRect(x, GROUND + 16, 22, 5)
      }

      for (const o of g.obstacles) {
        if (o.type === 'jump') {
          ctx.fillStyle = '#6d5bd0'
          ctx.beginPath()
          ctx.moveTo(o.x, GROUND)
          ctx.lineTo(o.x + o.w / 2, GROUND - o.h)
          ctx.lineTo(o.x + o.w, GROUND)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = '#5747b0'
          ctx.beginPath()
          ctx.moveTo(o.x, GROUND)
          ctx.lineTo(o.x + o.w / 2, GROUND - o.h)
          ctx.lineTo(o.x + o.w / 2, GROUND)
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.fillStyle = '#e05a5a'
          ctx.fillRect(o.x, 0, o.w, o.h)
          ctx.fillStyle = '#c74444'
          for (let y = o.h - 14; y >= 0; y -= 22) {
            ctx.fillRect(o.x, y, o.w, 8)
          }
        }
      }

      const p = g.player
      if (g.phase === 'playing' || g.phase === 'start') {
        if (!(p.invincible > 0 && Math.floor(p.invincible) % 6 < 3)) {
          const cy = p.y + p.h / 2
          drawCookie(p, p.x + p.w / 2, cy, p.h)
        }
      }

      const barX = 20
      const barY = 20
      const barW = 260
      const barH = 22
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.roundRect(barX, barY, barW, barH, 11)
      ctx.fill()
      const ratio = Math.max(0, g.health / 100)
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
      grad.addColorStop(0, '#ff5a5a')
      grad.addColorStop(0.5, '#ffd166')
      grad.addColorStop(1, '#4ade80')
      ctx.fillStyle = grad
      if (ratio > 0) {
        ctx.beginPath()
        ctx.roundRect(barX, barY, barW * ratio, barH, 11)
        ctx.fill()
      }
      ctx.fillStyle = '#fff'
      ctx.font = '700 13px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('HP', barX + 10, barY + 16)

      ctx.fillStyle = '#1f2937'
      ctx.textAlign = 'right'
      ctx.font = '800 26px system-ui, sans-serif'
      ctx.fillText(String(Math.floor(g.score)), WIDTH - 24, 42)
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillStyle = '#4b5563'
      ctx.fillText('SCORE', WIDTH - 24, 60)
    }

    const loop = (now) => {
      const dt = Math.min((now - last) / (1000 / 60), 3)
      last = now
      if (g.phase === 'playing') update(dt)
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const down = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        keysRef.current.down = true
        e.preventDefault()
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault()
        if (e.repeat) return
        const { start, jump } = actionsRef.current
        const screenNow = screen
        if (screenNow === 'start' || screenNow === 'over') start()
        else jump()
      }
    }
    const up = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        keysRef.current.down = false
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [screen])

  const onCanvasPointer = () => {
    const { start, jump } = actionsRef.current
    if (screen === 'start' || screen === 'over') start()
    else jump()
  }

  const pressSlide = (v) => {
    keysRef.current.down = v
  }

  return (
    <div className="game-wrap">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={onCanvasPointer}
      />
      {screen !== 'playing' && (
        <div className="overlay">
          {screen === 'start' ? (
            <>
              <h1 className="title">쿠키런 장애물 달리기</h1>
              <p className="sub">
                스페이스바 / ↑ — 점프 &nbsp;&nbsp;·&nbsp;&nbsp; ↓ — 슬라이드
              </p>
              <p className="hint">체력이 다 닳기 전에 장애물을 피해 점수를 얻으세요!</p>
              <button className="start-btn" onClick={onCanvasPointer}>
                게임 시작
              </button>
            </>
          ) : (
            <>
              <h1 className="title">게임 오버</h1>
              <p className="score-big">점수 {finalScore}</p>
              <p className="hint">최고 기록 {bestScore}</p>
              <button className="start-btn" onClick={onCanvasPointer}>
                다시 시작
              </button>
            </>
          )}
        </div>
      )}
      {screen === 'playing' && (
        <div className="touch-controls">
          <button
            className="ctrl slide"
            onPointerDown={() => pressSlide(true)}
            onPointerUp={() => pressSlide(false)}
            onPointerLeave={() => pressSlide(false)}
          >
            슬라이드
          </button>
          <button className="ctrl jump" onPointerDown={onCanvasPointer}>
            점프
          </button>
        </div>
      )}
    </div>
  )
}

export default App
