import { SingleBar } from 'cli-progress'
import pc from 'picocolors'

function parseSizeToBytes(input: string): number | null {
  const m = input.trim().match(/^([\d.]+)\s*(B|bytes|KiB|kB|KB|MiB|MB|GiB|GB)?$/i)
  if (!m) return null
  const num = parseFloat(m[1])
  if (!Number.isFinite(num)) return null
  const unit = (m[2] || 'B').toLowerCase()
  const map: Record<string, number> = {
    b: 1, bytes: 1,
    kib: 1024, kb: 1024,
    mib: 1024 * 1024, mb: 1024 * 1024,
    gib: 1024 * 1024 * 1024, gb: 1024 * 1024 * 1024,
  }
  const mult = map[unit] ?? 1
  return Math.floor(num * mult)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

/**
 * Honest download progress: percentage bar when total size is known,
 * otherwise a live spinner with byte count / speed.
 */
export class DownloadProgress {
  private barActive = false
  private liveActive = false
  private currentBytes = 0
  private lastSpeed = ''
  private throbIdx = 0
  private readonly throbber = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private readonly progressBar: SingleBar | null

  constructor(private readonly totalBytes: number | null) {
    this.progressBar = totalBytes
      ? new SingleBar({
          format: `   ${pc.cyan('{bar}')} {percentage}% | {value} / {total} | ETA: {eta_formatted}`,
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
          stopOnComplete: true,
        })
      : null
  }

  handleLine(line: string): void {
    const pct = line.match(/\[download\].*?([\d.]+)%/)
    if (pct) {
      this.updateFromClassicPercent(Math.min(100, Math.max(0, parseFloat(pct[1]))))
    }
    this.parseFfmpegStats(line)
  }

  finish(success: boolean): void {
    if (this.barActive && this.progressBar) {
      if (success && this.totalBytes) this.progressBar.update(100)
      this.progressBar.stop()
    }
    if (this.liveActive) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r')
      if (success) {
        console.log(`✅ Download complete! (${this.currentBytes ? formatBytes(this.currentBytes) : 'done'})`)
      }
    } else if (success) {
      console.log('✅ Download complete!')
    }
  }

  private startBarIfNeeded(): void {
    if (this.progressBar && !this.barActive) {
      this.progressBar.start(100, 0, {
        value: '0 B',
        total: this.totalBytes ? formatBytes(this.totalBytes) : '?',
      })
      this.barActive = true
    }
  }

  private updateFromClassicPercent(percent: number): void {
    if (this.progressBar) {
      this.startBarIfNeeded()
      this.progressBar.update(percent)
    }
  }

  private updateFromRealBytes(bytes: number): void {
    this.currentBytes = bytes
    if (this.progressBar && this.totalBytes && this.totalBytes > 0) {
      const pct = Math.min(99.5, (bytes / this.totalBytes) * 100)
      this.startBarIfNeeded()
      this.progressBar.update(pct, {
        value: formatBytes(bytes),
        total: formatBytes(this.totalBytes),
      })
    } else if (!this.progressBar) {
      this.liveActive = true
      this.renderLive()
    }
  }

  private renderLive(): void {
    if (!this.liveActive) return
    const char = this.throbber[this.throbIdx++ % this.throbber.length]
    const sizePart = this.currentBytes > 0 ? formatBytes(this.currentBytes) : '…'
    const speedPart = this.lastSpeed ? ` @ ${this.lastSpeed}` : ''
    process.stdout.write(`\r${char} Downloading ${sizePart}${speedPart}   `)
  }

  private parseFfmpegStats(line: string): void {
    const sizeMatch = line.match(/size=\s*([\d.]+\s*(?:KiB|kB|MiB|MB)?)/i)
    if (sizeMatch) {
      const bytes = parseSizeToBytes(sizeMatch[1])
      if (bytes != null) this.updateFromRealBytes(bytes)
    }
    const speedMatch = line.match(/speed=\s*([\d.]+x)/i)
    if (speedMatch) this.lastSpeed = speedMatch[1]
  }
}
