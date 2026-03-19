/**
 * Renders a 2D wake field grid to a canvas data URL for use as a Leaflet ImageOverlay.
 *
 * Color map:
 *   speed_ratio = 1.0 (freestream)  → transparent
 *   speed_ratio = 0.95 (5% deficit) → light blue, low alpha
 *   speed_ratio = 0.85 (15% deficit)→ yellow, medium alpha
 *   speed_ratio ≤ 0.70 (30%+ deficit)→ red, high alpha
 */
export function renderWakeFieldToDataUrl(
  grid: number[][],
  rows: number,
  cols: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(cols, rows)
  const data = imageData.data

  for (let row = 0; row < rows; row++) {
    // Flip Y: grid[0] is the bottom (south), canvas row 0 is the top (north)
    const gridRow = grid[rows - 1 - row]
    for (let col = 0; col < cols; col++) {
      const speedRatio = gridRow[col]
      const deficit = 1.0 - speedRatio  // 0 = no wake, 1 = full blockage

      const idx = (row * cols + col) * 4

      if (deficit < 0.02) {
        // Essentially freestream — fully transparent
        data[idx] = 0
        data[idx + 1] = 0
        data[idx + 2] = 0
        data[idx + 3] = 0
        continue
      }

      // Color interpolation: deficit 0.02 → 0.40+
      const t = Math.min(deficit / 0.40, 1.0) // 0..1 across the range

      let r: number, g: number, b: number
      if (t < 0.25) {
        // Light blue → cyan
        const s = t / 0.25
        r = 50
        g = Math.round(130 + 80 * s)   // 130 → 210
        b = Math.round(220 - 20 * s)   // 220 → 200
      } else if (t < 0.50) {
        // Cyan → yellow/green
        const s = (t - 0.25) / 0.25
        r = Math.round(50 + 200 * s)   // 50 → 250
        g = Math.round(210 - 10 * s)   // 210 → 200
        b = Math.round(200 - 170 * s)  // 200 → 30
      } else if (t < 0.75) {
        // Yellow → orange
        const s = (t - 0.50) / 0.25
        r = Math.round(250 + 5 * s)    // 250 → 255
        g = Math.round(200 - 120 * s)  // 200 → 80
        b = Math.round(30 - 10 * s)    // 30 → 20
      } else {
        // Orange → red
        const s = (t - 0.75) / 0.25
        r = 255
        g = Math.round(80 - 60 * s)    // 80 → 20
        b = Math.round(20 + 10 * s)    // 20 → 30
      }

      // Alpha: ramp from 0 at deficit=0.02 to ~170 at full deficit
      const alpha = Math.round(40 + 140 * t)

      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = alpha
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
