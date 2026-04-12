export function formatYMDToLocale(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return ''
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return dateStr
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
    const fmt = new Intl.DateTimeFormat(undefined, opts || { dateStyle: 'medium' })
    return fmt.format(dt)
  } catch {
    return dateStr
  }
}

