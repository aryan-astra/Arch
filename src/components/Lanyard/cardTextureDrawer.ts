// Pure 2D canvas drawing for the Arch ID card textures.
// Front face: Framer-conf style — dark bg with scattered 'Arch' typographic
// pattern, dominant name, student label, reg number.
// Back face: Handwritten note aesthetic — black bg, torn white paper,
// 'you have never left my mind since the day we met.' text.

export type CardState = 'blank' | 'filling' | 'ready' | 'error'

export type CardData = {
  name?: string
  regNo?: string
  program?: string
  department?: string
  year?: string
  section?: string
  semester?: string | number
  validUntil?: string
  email?: string
  qrUrl?: string
}

export type CardTheme = {
  bg: string
  fg: string
  accent: string
  muted: string
  ring: string
}

export const DEFAULT_THEME: CardTheme = {
  bg: '#080810',
  fg: '#F0F0F5',
  accent: '#FFFFFF',
  muted: '#52526A',
  ring: '#1E1E2C',
}

// Card aspect roughly matches the React Bits card.glb (0.8 x 1.125 collider).
// We render at 2x density for crispness.
export const CARD_W = 1024
export const CARD_H = 1440

// `letterSpacing` on CanvasRenderingContext2D is non-standard (Chrome-only).
// Best-effort helper so call sites stay clean for the linter.
function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  try {
    ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = value
  } catch {
    // Unsupported canvas — kerning fallback is simply skipped.
  }
}

// Lightweight QR matrix renderer.
// We do not need real QR encoding for the v1 ID card — the QR is a placeholder
// for the future profile-share URL. We draw a deterministic noise pattern
// seeded by `qrUrl` so each user's card looks unique without bundling a QR lib
// into the Lanyard chunk. A real QR code will swap in later when the
// social-share feature lands (we'll lazy-import `qrcode.react` then).
function drawPlaceholderQr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: string,
  theme: CardTheme,
) {
  const cells = 25
  const cell = size / cells
  // Simple deterministic PRNG (mulberry32) seeded from string hash.
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  ctx.fillStyle = theme.bg
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = theme.fg
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Force three position-detection patterns (top-left, top-right, bot-left)
      // so it reads as a QR shape at a glance.
      const inFinder =
        (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)
      const isFinderPixel =
        inFinder &&
        ((r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ||
          (r === 0 || r === 6 || c === cells - 7 || c === cells - 1 || (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3)) ||
          (r === cells - 7 || r === cells - 1 || c === 0 || c === 6 || (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4)))
      const filled = isFinderPixel || (!inFinder && rand() > 0.55)
      if (filled) ctx.fillRect(x + c * cell, y + r * cell, cell, cell)
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ── Dark ID card front — labeled fields + progressive reveal ─────────────────
export function drawCardTexture(
  canvas: HTMLCanvasElement,
  state: CardState,
  data: CardData,
  theme: CardTheme = DEFAULT_THEME,
  fillProgress = 1,
  logoImg?: HTMLImageElement | null,
) {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const reveal = state === 'filling' ? Math.max(0, Math.min(1, fillProgress)) : (state === 'blank' ? 0 : 1)
  const isBlank = state === 'blank'

  const PAD = 56

  // ── Background ───────────────────────────────────────────────────────────────
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // ── HEADER (0–148) ───────────────────────────────────────────────────────────
  const LOGO_Y = 34
  const LOGO_SIZE = 72
  if (logoImg) {
    // Draw logo using 'lighten' blend mode so the black SVG background
    // becomes invisible against the dark card, leaving only the icon visible.
    ctx.save()
    ctx.globalCompositeOperation = 'lighten'
    ctx.drawImage(logoImg, PAD, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
    ctx.restore()
  } else {
    ctx.save()
    roundRect(ctx, PAD, LOGO_Y, LOGO_SIZE, LOGO_SIZE, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.fillStyle = theme.fg
    ctx.font = '900 32px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', PAD + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2 + 2)
    ctx.restore()
  }
  ctx.fillStyle = theme.fg
  ctx.font = '700 36px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Arch', PAD + LOGO_SIZE + 14, LOGO_Y + LOGO_SIZE / 2)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '600 24px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('SRMIST', CARD_W - PAD, LOGO_Y + 6)
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.font = '500 19px ui-mono, "Courier New", monospace'
  ctx.fillText('STUDENT ID', CARD_W - PAD, LOGO_Y + 38)

  // Divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(PAD, 148)
  ctx.lineTo(CARD_W - PAD, 148)
  ctx.stroke()

  // ── Field reveal thresholds ──────────────────────────────────────────────────
  // name: 0→0.28, program: 0.28→0.50, regNo: 0.50→0.72, valid+semester: 0.72→1
  // In blank state show ghost placeholders at low opacity so the card layout reads.
  const ghostRev = isBlank ? 0.6 : 1
  const nameRev  = isBlank ? ghostRev : Math.min(1, reveal / 0.28)
  const progRev  = isBlank ? ghostRev : Math.max(0, Math.min(1, (reveal - 0.28) / 0.22))
  const regRev   = isBlank ? ghostRev : Math.max(0, Math.min(1, (reveal - 0.50) / 0.22))
  const validRev = isBlank ? ghostRev : Math.max(0, Math.min(1, (reveal - 0.72) / 0.28))

  // ── Helper: draw a labelled ID field ────────────────────────────────────────
  // `ctx` is passed explicitly (rather than closed over) so strict-null
  // narrowing from the `if (!ctx) return` guard above is preserved.
  function drawField(
    g: CanvasRenderingContext2D,
    label: string,
    value: string,
    fx: number,
    fy: number,
    fontSize: number,
    fieldReveal: number,
    mono = false,
  ) {
    if (fieldReveal <= 0) return
    const alpha = Math.min(1, fieldReveal)
    // Label
    g.save()
    g.globalAlpha = alpha * (isBlank ? 0.55 : 0.42)
    g.fillStyle = theme.fg
    g.font = '500 21px ui-sans-serif, system-ui, sans-serif'
    g.textAlign = 'left'
    g.textBaseline = 'top'
    setLetterSpacing(g, '0.13em')
    g.fillText(label.toUpperCase(), fx, fy)
    setLetterSpacing(g, '0')
    g.restore()
    // Value — typewriter character reveal (in blank state show full placeholder)
    g.save()
    g.globalAlpha = alpha * (isBlank ? 0.65 : 1)
    g.fillStyle = isBlank ? theme.fg : theme.fg
    const family = mono ? 'ui-mono, "Courier New", monospace' : 'ui-sans-serif, system-ui, sans-serif'
    g.font = `700 ${fontSize}px ${family}`
    g.textAlign = 'left'
    g.textBaseline = 'top'
    const shown = isBlank ? value : value.slice(0, Math.max(1, Math.ceil(value.length * fieldReveal)))
    const maxW = CARD_W - fx - PAD
    g.fillText(shown || '—', fx, fy + 30, maxW)
    g.restore()
  }

  // ── NAME (y = 172) ───────────────────────────────────────────────────────────
  const nameVal = isBlank ? 'Student Name' : (data.name || '—')
  drawField(ctx, 'Name', nameVal, PAD, 172, 64, nameRev)

  // ── PROGRAMME (y = 358) ──────────────────────────────────────────────────────
  const progVal = isBlank ? 'B.Tech Programme' : (data.program || '—')
  drawField(ctx, 'Programme', progVal, PAD, 360, 50, progRev)

  // ── REGISTER NO (y = 468) ────────────────────────────────────────────────────
  const regVal = isBlank ? 'RA0000000' : (data.regNo || '—')
  drawField(ctx, 'Register No', regVal, PAD, 472, 46, regRev, true)

  // ── VALID UNTIL | SEMESTER (y = 590) — side by side ─────────────────────────
  const validVal = isBlank ? 'MAY 2028' : (data.validUntil || 'MAY 2028')
  const semVal = isBlank
    ? 'Sem X'
    : data.semester
      ? `Sem ${data.semester}`
      : '—'
  drawField(ctx, 'Valid Until', validVal, PAD, 590, 38, validRev)
  drawField(ctx, 'Semester', semVal, CARD_W / 2 + 20, 590, 38, validRev)

  // ── Separator line above QR ──────────────────────────────────────────────────
  if (validRev > 0.5) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, (validRev - 0.5) * 2) * 0.10
    ctx.strokeStyle = theme.fg
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, 726)
    ctx.lineTo(CARD_W - PAD, 726)
    ctx.stroke()
    ctx.restore()
  }

  // ── QR code (bottom-right, y = 740) ─────────────────────────────────────────
  if (!isBlank && validRev > 0.3) {
    const QR_SIZE = 220
    const QR_X = CARD_W - PAD - QR_SIZE
    const QR_Y = 740
    ctx.save()
    ctx.globalAlpha = Math.min(1, (validRev - 0.3) / 0.5)
    drawPlaceholderQr(ctx, QR_X, QR_Y, QR_SIZE, data.qrUrl || 'arch', theme)
    ctx.globalAlpha = ctx.globalAlpha * 0.45
    ctx.fillStyle = theme.fg
    ctx.font = '500 17px ui-mono, "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    setLetterSpacing(ctx, '0.07em')
    ctx.fillText('SCAN TO VERIFY', QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 10)
    setLetterSpacing(ctx, '0')
    ctx.restore()
  }

  // ── Bottom URL ───────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.36)'
  ctx.font = '500 23px ui-mono, "Courier New", monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  setLetterSpacing(ctx, '0.08em')
  ctx.fillText('ARCH.SRMIST.EDU.IN', PAD, CARD_H - 42)
  setLetterSpacing(ctx, '0')

  // Thin top rim
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 1)
  ctx.lineTo(CARD_W, 1)
  ctx.stroke()

  // ── Error overlay ────────────────────────────────────────────────────────────
  if (state === 'error') {
    ctx.save()
    ctx.translate(CARD_W / 2, CARD_H / 2)
    ctx.rotate((-11 * Math.PI) / 180)
    ctx.fillStyle = 'rgba(215, 53, 42, 0.15)'
    roundRect(ctx, -380, -80, 760, 160, 14)
    ctx.fill()
    ctx.strokeStyle = '#D7352A'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#D7352A'
    ctx.font = '700 60px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('INVALID CREDENTIALS', 0, 0)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }
}

// ── Back face ─────────────────────────────────────────────────────────────────
// Renders: pure black bg + centered folded white paper note matching the
// handwritten-note photo aesthetic.  If `img` is provided it is used as a
// cover-fill replacement instead.
export function drawCardBackTexture(canvas: HTMLCanvasElement, img?: HTMLImageElement | null) {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // ── Pure black background (matches the photo exactly) ────────────────────────
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // ── Photo path ───────────────────────────────────────────────────────────────
  if (img) {
    const scale = Math.max(CARD_W / img.naturalWidth, CARD_H / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = (CARD_W - dw) / 2
    const dy = (CARD_H - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
    return
  }

  // ── Canvas-drawn fallback: folded paper note ──────────────────────────────────
  // Dimensions tuned to look like the folded-note photo (landscape note on
  // portrait card, slightly above vertical center).
  const NW = 680
  const NH = 480
  const NX = (CARD_W - NW) / 2
  const NY = (CARD_H - NH) / 2 - 30

  // Drop shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = 48
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#EDEAE0'
  ctx.fillRect(NX, NY, NW, NH)
  ctx.restore()

  // Paper base
  ctx.fillStyle = '#EDEAE0'
  ctx.fillRect(NX, NY, NW, NH)

  // Subtle paper gradient (lighter top-left, slightly darker bottom-right)
  const pg = ctx.createLinearGradient(NX, NY, NX + NW, NY + NH)
  pg.addColorStop(0, 'rgba(255,255,255,0.18)')
  pg.addColorStop(1, 'rgba(0,0,0,0.06)')
  ctx.fillStyle = pg
  ctx.fillRect(NX, NY, NW, NH)

  // Horizontal fold crease through middle
  const fH = NY + NH * 0.5
  ctx.strokeStyle = 'rgba(0,0,0,0.13)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(NX, fH); ctx.lineTo(NX + NW, fH); ctx.stroke()

  // Vertical fold crease through middle
  const fV = NX + NW * 0.5
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(fV, NY); ctx.lineTo(fV, NY + NH); ctx.stroke()

  // Handwritten-style text
  ctx.font = `italic 56px "Brush Script MT", "Apple Chancery", cursive`
  ctx.fillStyle = '#151010'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const lines = ['you have never', 'left my mind', 'since the day', 'we met.']
  const lineH = 94
  const tX = NX + 52
  const tY = NY + 72

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, tX, tY + i * lineH)
  }
  return  // explicit return so the old fallback below is never reached
}
