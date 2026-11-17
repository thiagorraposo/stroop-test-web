/** Gerador local determinístico de QR Code em SVG (ISO/IEC 18004, modo Byte, ECC M, versões 1–6).
 * Sem requisições externas nem dependências adicionais. */

const VERSIONS = [
  { version: 1, total: 26, data: 16, blocks: 1, ecPerBlock: 10, align: [] as number[] },
  { version: 2, total: 44, data: 28, blocks: 1, ecPerBlock: 16, align: [6, 18] },
  { version: 3, total: 70, data: 44, blocks: 1, ecPerBlock: 26, align: [6, 22] },
  { version: 4, total: 100, data: 64, blocks: 2, ecPerBlock: 18, align: [6, 26] },
  { version: 5, total: 134, data: 86, blocks: 2, ecPerBlock: 24, align: [6, 30] },
  { version: 6, total: 172, data: 108, blocks: 4, ecPerBlock: 16, align: [6, 34] },
] as const

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!
}

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    const factor = GF_EXP[i]!
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!
      next[j + 1]! ^= gfMul(poly[j]!, factor)
    }
    poly = next
  }
  return poly
}

function rsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGenerator(ecCount)
  const buf = new Uint8Array(data.length + ecCount)
  buf.set(data)
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i]!
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) buf[i + j]! ^= gfMul(gen[j]!, coef)
    }
  }
  return buf.slice(data.length)
}

function formatBits(mask: number): number {
  const data = mask & 0x7 // ECC M = 00
  let rem = data << 10
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >> bit) & 1) rem ^= 0x537 << (bit - 10)
  }
  return ((data << 10) | rem) ^ 0x5412
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text)
  const spec = VERSIONS.find(v => bytes.length + 2 <= v.data)
  if (!spec) throw new Error('Conteúdo excede a capacidade local do QR Code.')

  const bits: number[] = []
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1)
  }
  push(0b0100, 4) // Byte mode
  push(bytes.length, 8)
  for (const b of bytes) push(b, 8)
  const maxBits = spec.data * 8
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const dataBytes = new Uint8Array(spec.data)
  for (let i = 0; i < bits.length / 8; i++) {
    let val = 0
    for (let j = 0; j < 8; j++) val = (val << 1) | bits[i * 8 + j]!
    dataBytes[i] = val
  }
  for (let i = bits.length / 8, pad = 0; i < spec.data; i++, pad++) {
    dataBytes[i] = pad % 2 === 0 ? 0xec : 0x11
  }

  const blockSize = spec.data / spec.blocks
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  for (let b = 0; b < spec.blocks; b++) {
    const slice = dataBytes.slice(b * blockSize, (b + 1) * blockSize)
    dataBlocks.push(slice)
    ecBlocks.push(rsRemainder(slice, spec.ecPerBlock))
  }
  const codewords: number[] = []
  for (let i = 0; i < blockSize; i++) for (const block of dataBlocks) codewords.push(block[i]!)
  for (let i = 0; i < spec.ecPerBlock; i++) for (const block of ecBlocks) codewords.push(block[i]!)

  const size = spec.version * 4 + 17
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const setFn = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      grid[r]![c] = dark
      reserved[r]![c] = true
    }
  }
  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const dark = r >= 0 && r <= 6 && c >= 0 && c <= 6
          && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        setFn(top + r, left + c, dark)
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)
  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0)
    setFn(i, 6, i % 2 === 0)
  }
  setFn(size - 8, 8, true)
  for (const r of spec.align) {
    for (const c of spec.align) {
      if (reserved[r]![c]) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
        }
      }
    }
  }
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      reserved[8]![i] = true
      reserved[i]![8] = true
    }
  }
  for (let i = 0; i < 8; i++) reserved[8]![size - 1 - i] = true
  for (let i = 0; i < 7; i++) reserved[size - 1 - i]![8] = true

  let bitIdx = 0
  const totalBits = codewords.length * 8
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      const r = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
      for (const c of [right, right - 1]) {
        if (!reserved[r]![c]) {
          const bit = bitIdx < totalBits ? (codewords[bitIdx >> 3]! >> (7 - (bitIdx & 7))) & 1 : 0
          grid[r]![c] = bit === 1
          bitIdx++
        }
      }
    }
  }

  const maskFn = (mask: number, r: number, c: number): boolean => [
    (r + c) % 2 === 0,
    r % 2 === 0,
    c % 3 === 0,
    (r + c) % 3 === 0,
    (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    ((r * c) % 2) + ((r * c) % 3) === 0,
    (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][mask]!

  let bestGrid = grid
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    const cand = grid.map((row, r) => row.map((cell, c) => (reserved[r]![c] ? cell : cell !== maskFn(mask, r, c))))
    const fmt = formatBits(mask)
    for (let i = 0; i < 15; i++) {
      const bit = ((fmt >> i) & 1) === 1
      if (i < 6) cand[i]![8] = bit
      else if (i < 8) cand[i + 1]![8] = bit
      else cand[size - 15 + i]![8] = bit
      if (i < 8) cand[8]![size - 1 - i] = bit
      else if (i < 9) cand[8]![15 - i] = bit
      else cand[8]![14 - i] = bit
    }
    let score = 0
    for (let r = 0; r < size; r++) {
      let run = 1
      for (let c = 1; c < size; c++) {
        if (cand[r]![c] === cand[r]![c - 1]) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score++
        } else run = 1
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1
      for (let r = 1; r < size; r++) {
        if (cand[r]![c] === cand[r - 1]![c]) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score++
        } else run = 1
      }
    }
    if (score < bestScore) {
      bestScore = score
      bestGrid = cand
    }
  }
  return bestGrid
}

export function QrCodeSvg({ value, label, size = 160 }: { value: string; label: string; size?: number }) {
  const matrix = encodeQrMatrix(value)
  const quiet = 4
  const total = matrix.length + quiet * 2
  const rects: string[] = []
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r]![c]) rects.push(`M${c + quiet},${r + quiet}h1v1h-1z`)
    }
  }
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className="qr-code-svg"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={rects.join('')} fill="#0f172a" />
    </svg>
  )
}
