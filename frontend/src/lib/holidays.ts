import { useQueries } from '@tanstack/react-query'
import { api } from './api'

export type Holiday = { date: string; localName: string; name: string; global: boolean; counties?: string[]; types?: string[] }

export function yearsInRange(start: string, end: string): number[] {
  const ys = new Set<number>()
  const sy = new Date(start).getUTCFullYear()
  const ey = new Date(end).getUTCFullYear()
  for (let y = sy; y <= ey; y++) ys.add(y)
  return Array.from(ys)
}

export function useHolidays(country?: string | null, region?: string | null, start?: string, end?: string) {
  const years = (country && start && end) ? yearsInRange(start, end) : []
  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: ['holidays', country, region || '', year] as const,
      queryFn: () => api.getHolidays(country!, year, region || undefined),
      enabled: !!country,
      staleTime: 24 * 3600 * 1000,
    })),
    combine: (res) => {
      const loading = res.some((r) => r.isLoading)
      const error = res.find((r) => r.error)?.error
      const data: Holiday[] = []
      for (const r of res) if (r.data) data.push(...r.data)
      const labelByDate = new Map<string, string>()
      for (const h of data) {
        if (h && h.date && h.localName && !labelByDate.has(h.date)) labelByDate.set(h.date, h.localName)
      }
      return { loading, error, data, labelByDate }
    },
  })
  // results is the combined object due to combine
  return results
}
