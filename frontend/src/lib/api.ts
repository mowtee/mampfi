export type UUID = string

// Use nullish coalescing so an intentional empty string ('') is respected for same-origin setups
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const DEV_EMAIL_FALLBACK = import.meta.env.VITE_DEV_EMAIL || ''

function devHeaders() {
  const email = localStorage.getItem('devEmail') || DEV_EMAIL_FALLBACK || ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (email) headers['X-Dev-User'] = email
  return headers
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...devHeaders(), ...(init?.headers as any) },
  })
  if (!res.ok) {
    let detail
    try { detail = await res.json() } catch {}
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(detail || {})}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : (undefined as any)
}

export type Event = {
  id: UUID
  name: string
  description?: string | null
  start_date: string
  end_date: string
  timezone: string
  cutoff_time: string
  currency: string
  holiday_country_code?: string | null
  holiday_region_code?: string | null
  left_at?: string | null
}

export type PriceItem = { id: UUID; name: string; unit_price_minor: number; active: boolean }
export type Member = { user_id: UUID; email?: string | null; name?: string | null; role: string; joined_at: string; left_at?: string | null }

export const api = {
  // Identity
  getMe: () => http<{ id: UUID; email: string; name?: string | null; locale?: string | null }>(`/v1/me`),
  listEvents: () => http<Event[]>(`/v1/events`),
  getEvent: (id: UUID) => http<Event>(`/v1/events/${id}`),
  listPriceItems: (eventId: UUID, includeInactive = false) =>
    http<PriceItem[]>(`/v1/events/${eventId}/price-items${includeInactive ? '?include_inactive=true' : ''}`),
  addPriceItem: (eventId: UUID, name: string, unit_price_minor: number) =>
    http<PriceItem>(`/v1/events/${eventId}/price-items`, { method: 'POST', body: JSON.stringify({ name, unit_price_minor }) }),
  deactivatePriceItem: (eventId: UUID, price_item_id: UUID) =>
    http<void>(`/v1/events/${eventId}/price-items/${price_item_id}/deactivate`, { method: 'POST' }),
  activatePriceItem: (eventId: UUID, price_item_id: UUID) =>
    http<void>(`/v1/events/${eventId}/price-items/${price_item_id}/activate`, { method: 'POST' }),
  createEvent: (data: {
    name: string
    description?: string | null
    start_date: string
    end_date: string
    timezone: string
    cutoff_time: string
    currency: string
    price_items: { name: string; unit_price_minor: number; active?: boolean }[]
    holiday_country_code?: string | null
    holiday_region_code?: string | null
  }) => http(`/v1/events`, { method: 'POST', body: JSON.stringify(data) }),
  getMyOrder: (eventId: UUID, date: string) => http<{ event_id: UUID; user_id: UUID; date: string; is_rolled_over?: boolean; items: { price_item_id: string; qty: number; name?: string; unit_price_minor?: number; item_total_minor?: number; inactive?: boolean }[]; total_minor?: number }>(`/v1/events/${eventId}/orders/${date}/me`),
  upsertMyOrder: (eventId: UUID, date: string, items: { price_item_id: string; qty: number }[]) =>
    http(`/v1/events/${eventId}/orders/${date}/me`, { method: 'PUT', body: JSON.stringify({ date, items }) }),
  aggregate: (eventId: UUID, date: string) => http<{ date: string; total_minor?: number; items: any[] }>(`/v1/events/${eventId}/orders/aggregate?date=${date}`),
  // Balances
  getBalances: (eventId: UUID) => http<{ currency: string; totals: { user_id: UUID; balance_minor: number; wants_to_leave?: boolean }[] }>(`/v1/events/${eventId}/balances`),
  // Leaving intent
  setLeaveIntent: (eventId: UUID, wants_to_leave: boolean) =>
    http<{ status: string; wants_to_leave: boolean }>(`/v1/events/${eventId}/members/me/leave-intent`, { method: 'POST', body: JSON.stringify({ wants_to_leave }) }),
  leaveEvent: async (eventId: UUID) => {
    // Direct fetch to capture 204/409 details more flexibly
    const res = await fetch(`${API_URL}/v1/events/${eventId}/members/me/leave`, { method: 'POST', headers: devHeaders() })
    if (res.status === 204) return { ok: true }
    let detail: any = undefined
    try { detail = await res.json() } catch {}
    const err = new Error(`HTTP ${res.status}: ${JSON.stringify(detail || {})}`)
    ;(err as any).detail = detail
    throw err
  },
  // Payments
  listPayments: (eventId: UUID, status?: 'pending'|'confirmed'|'declined'|'canceled') =>
    http<{ id: UUID; event_id: UUID; from_user_id: UUID; to_user_id: UUID; amount_minor: number; currency: string; status: string; note?: string | null; created_at: string; decided_at?: string | null; version: number }[]>(
      `/v1/events/${eventId}/payments${status ? `?status=${status}` : ''}`
    ),
  createPayment: (eventId: UUID, to_user_id: UUID, amount_minor: number, note?: string) =>
    http(`/v1/events/${eventId}/payments`, { method: 'POST', body: JSON.stringify({ to_user_id, amount_minor, note }) }),
  confirmPayment: (eventId: UUID, payment_id: UUID) => http(`/v1/events/${eventId}/payments/${payment_id}/confirm`, { method: 'POST' }),
  declinePayment: (eventId: UUID, payment_id: UUID, reason?: string) =>
    http(`/v1/events/${eventId}/payments/${payment_id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cancelPayment: (eventId: UUID, payment_id: UUID) => http(`/v1/events/${eventId}/payments/${payment_id}/cancel`, { method: 'POST' }),
  // Invites
  listInvites: (eventId: UUID) =>
    http<{ id: UUID; event_id: UUID; expires_at: string; revoked_at?: string | null; max_uses?: number | null; used_count: number; last_used_at?: string | null }[]>(`/v1/events/${eventId}/invites`),
  createGroupInvite: (eventId: UUID, ttl_days = 14, max_uses?: number) =>
    http<{ invite: any; token: string; invite_url: string }>(`/v1/events/${eventId}/invites/group`, { method: 'POST', body: JSON.stringify({ ttl_days, max_uses }) }),
  createSingleInvite: (eventId: UUID, ttl_days = 14, email?: string) =>
    http<{ invite: any; token: string; invite_url: string }>(`/v1/events/${eventId}/invites/single`, { method: 'POST', body: JSON.stringify({ ttl_days, email }) }),
  revokeInvite: (eventId: UUID, invite_id: UUID) => http(`/v1/events/${eventId}/invites/${invite_id}/revoke`, { method: 'POST' }),
  redeemInvite: (token: string) => http<{ status: string; event: { id: UUID; name: string } }>(`/v1/invites/redeem`, { method: 'POST', body: JSON.stringify({ token }) }),
  previewInvite: (token: string) => http<{ status: string; event: { id: UUID; name: string } }>(`/v1/invites/preview?token=${encodeURIComponent(token)}`),
  // Purchases
  createPurchase: (
    eventId: UUID,
    date: string,
    lines: { type: 'price_item'|'custom'; price_item_id?: UUID; name?: string; qty_final: number; unit_price_minor: number; reason?: string | null; allocations?: { user_id: UUID; qty: number }[] }[],
    notes?: string,
  ) => http(`/v1/events/${eventId}/purchases`, { method: 'POST', body: JSON.stringify({ date, lines, notes }) }),
  getPurchase: (eventId: UUID, date: string) =>
    http<{ event_id: UUID; date: string; buyer_id: UUID; finalized_at: string; total_minor: number; notes?: string | null; lines: any[] }>(`/v1/events/${eventId}/purchases/${date}`),
  listPurchases: (eventId: UUID, start_date?: string, end_date?: string) => {
    const qs = new URLSearchParams()
    if (start_date) qs.set('start_date', start_date)
    if (end_date) qs.set('end_date', end_date)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return http<{ event_id: UUID; date: string; buyer_id: UUID; finalized_at: string; total_minor: number; notes?: string | null }[]>(`/v1/events/${eventId}/purchases${suffix}`)
  },
  // Members
  listMembers: (eventId: UUID) => http<Member[]>(`/v1/events/${eventId}/members`),
  // Holidays
  getHolidays: (country: string, year: number, region?: string) =>
    http<{ date: string; localName: string; name: string; global: boolean; counties?: string[]; types?: string[] }[]>(
      `/v1/holidays?country=${encodeURIComponent(country)}&year=${year}${region ? `&region=${encodeURIComponent(region)}` : ''}`
    ),
  updateEvent: (eventId: UUID, data: { holiday_country_code?: string | null; holiday_region_code?: string | null }) =>
    http(`/v1/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(data) }),
}
