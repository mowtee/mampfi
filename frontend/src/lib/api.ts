import type { Aggregate, Balances, Invite, Payment, Purchase, PurchaseSummary } from "./types";

export type UUID = string;

// Use nullish coalescing so an intentional empty string ('') is respected for same-origin setups
const API_URL = import.meta.env.VITE_API_URL || "";
const DEV_EMAIL_FALLBACK = import.meta.env.VITE_DEV_EMAIL || "";

function devHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (import.meta.env.DEV) {
    const email = localStorage.getItem("devEmail") || DEV_EMAIL_FALLBACK || "";
    if (email) headers["X-Dev-User"] = email;
  }
  return headers;
}

let isRefreshing: Promise<boolean> | null = null;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...devHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });

  // Auto-refresh on 401 (skip for auth endpoints to avoid loops)
  if (res.status === 401 && !path.startsWith("/v1/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return http<T>(path, init);
    }
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    throw new Error("Session expired");
  }

  if (!res.ok) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      /* ignore parse errors */
    }
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(detail || {})}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

async function tryRefresh(): Promise<boolean> {
  if (!isRefreshing) {
    isRefreshing = fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).then((r) => r.ok);
  }
  try {
    return await isRefreshing;
  } finally {
    isRefreshing = null;
  }
}

export type Event = {
  id: UUID;
  name: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  cutoff_time: string;
  currency: string;
  holiday_country_code?: string | null;
  holiday_region_code?: string | null;
  delivery_fee_minor?: number | null;
  left_at?: string | null;
  role?: string | null;
};

export type PriceItem = { id: UUID; name: string; unit_price_minor: number; active: boolean };
export type Member = {
  user_id: UUID;
  email?: string | null;
  name?: string | null;
  role: string;
  joined_at: string;
  left_at?: string | null;
  note?: string | null;
};

export const api = {
  // Identity
  getMe: () =>
    http<{ id: UUID; email: string; name?: string | null; locale?: string | null }>(`/v1/me`),
  listEvents: () => http<Event[]>(`/v1/events`),
  getEvent: (id: UUID) => http<Event>(`/v1/events/${id}`),
  listPriceItems: (eventId: UUID, includeInactive = false) =>
    http<PriceItem[]>(
      `/v1/events/${eventId}/price-items${includeInactive ? "?include_inactive=true" : ""}`,
    ),
  addPriceItem: (eventId: UUID, name: string, unit_price_minor: number) =>
    http<PriceItem>(`/v1/events/${eventId}/price-items`, {
      method: "POST",
      body: JSON.stringify({ name, unit_price_minor }),
    }),
  deactivatePriceItem: (eventId: UUID, price_item_id: UUID) =>
    http<void>(`/v1/events/${eventId}/price-items/${price_item_id}/deactivate`, { method: "POST" }),
  activatePriceItem: (eventId: UUID, price_item_id: UUID) =>
    http<void>(`/v1/events/${eventId}/price-items/${price_item_id}/activate`, { method: "POST" }),
  createEvent: (data: {
    name: string;
    description?: string | null;
    start_date: string;
    end_date: string;
    timezone: string;
    cutoff_time: string;
    currency: string;
    price_items: { name: string; unit_price_minor: number; active?: boolean }[];
    holiday_country_code?: string | null;
    holiday_region_code?: string | null;
  }) => http(`/v1/events`, { method: "POST", body: JSON.stringify(data) }),
  getMyOrder: (eventId: UUID, date: string) =>
    http<{
      event_id: UUID;
      user_id: UUID;
      date: string;
      is_rolled_over?: boolean;
      items: {
        price_item_id: string;
        qty: number;
        name?: string;
        unit_price_minor?: number;
        item_total_minor?: number;
        inactive?: boolean;
      }[];
      total_minor?: number;
    }>(`/v1/events/${eventId}/orders/${date}/me`),
  upsertMyOrder: (eventId: UUID, date: string, items: { price_item_id: string; qty: number }[]) =>
    http(`/v1/events/${eventId}/orders/${date}/me`, {
      method: "PUT",
      body: JSON.stringify({ date, items }),
    }),
  aggregate: (eventId: UUID, date: string) =>
    http<Aggregate>(`/v1/events/${eventId}/orders/aggregate?date=${date}`),
  // Balances
  getBalances: (eventId: UUID) => http<Balances>(`/v1/events/${eventId}/balances`),
  // Leaving intent
  setLeaveIntent: (eventId: UUID, wants_to_leave: boolean) =>
    http<{ status: string; wants_to_leave: boolean }>(
      `/v1/events/${eventId}/members/me/leave-intent`,
      { method: "POST", body: JSON.stringify({ wants_to_leave }) },
    ),
  leaveEvent: async (eventId: UUID) => {
    // Direct fetch to capture 204/409 details more flexibly
    const res = await fetch(`${API_URL}/v1/events/${eventId}/members/me/leave`, {
      method: "POST",
      headers: devHeaders(),
    });
    if (res.status === 204) return { ok: true };
    let detail: unknown = undefined;
    try {
      detail = await res.json();
    } catch {
      /* ignore parse errors */
    }
    throw Object.assign(new Error(`HTTP ${res.status}: ${JSON.stringify(detail || {})}`), {
      detail,
    });
  },
  // Payments
  listPayments: (eventId: UUID, status?: "pending" | "confirmed" | "declined" | "canceled") =>
    http<Payment[]>(`/v1/events/${eventId}/payments${status ? `?status=${status}` : ""}`),
  createPayment: (eventId: UUID, to_user_id: UUID, amount_minor: number, note?: string) =>
    http(`/v1/events/${eventId}/payments`, {
      method: "POST",
      body: JSON.stringify({ to_user_id, amount_minor, note }),
    }),
  confirmPayment: (eventId: UUID, payment_id: UUID) =>
    http(`/v1/events/${eventId}/payments/${payment_id}/confirm`, { method: "POST" }),
  declinePayment: (eventId: UUID, payment_id: UUID, reason?: string) =>
    http(`/v1/events/${eventId}/payments/${payment_id}/decline`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  cancelPayment: (eventId: UUID, payment_id: UUID) =>
    http(`/v1/events/${eventId}/payments/${payment_id}/cancel`, { method: "POST" }),
  // Invites
  listInvites: (eventId: UUID) => http<Invite[]>(`/v1/events/${eventId}/invites`),
  createGroupInvite: (eventId: UUID, ttl_days = 14, max_uses?: number) =>
    http<{ invite: Invite; token: string; invite_url: string }>(
      `/v1/events/${eventId}/invites/group`,
      { method: "POST", body: JSON.stringify({ ttl_days, max_uses }) },
    ),
  createSingleInvite: (eventId: UUID, ttl_days = 14, email?: string) =>
    http<{ invite: Invite; token: string; invite_url: string }>(
      `/v1/events/${eventId}/invites/single`,
      { method: "POST", body: JSON.stringify({ ttl_days, email }) },
    ),
  revokeInvite: (eventId: UUID, invite_id: UUID) =>
    http(`/v1/events/${eventId}/invites/${invite_id}/revoke`, { method: "POST" }),
  sendEmailInvites: (eventId: UUID, emails: string, lang: string) =>
    http<{ sent: number; emails: string[] }>(`/v1/events/${eventId}/invites/email`, {
      method: "POST",
      body: JSON.stringify({ emails, lang }),
    }),
  redeemInvite: (token: string) =>
    http<{ status: string; event: { id: UUID; name: string } }>(`/v1/invites/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  previewInvite: (token: string) =>
    http<{ status: string; event: { id: UUID; name: string } }>(
      `/v1/invites/preview?token=${encodeURIComponent(token)}`,
    ),
  // Purchases
  createPurchase: (
    eventId: UUID,
    date: string,
    lines: {
      type: "price_item" | "custom";
      price_item_id?: UUID;
      name?: string;
      qty_final: number;
      unit_price_minor: number;
      reason?: string | null;
      allocations?: { user_id: UUID; qty: number }[];
    }[],
    notes?: string,
    delivery_fee_applied?: boolean,
  ) =>
    http(`/v1/events/${eventId}/purchases`, {
      method: "POST",
      body: JSON.stringify({ date, lines, notes, delivery_fee_applied }),
    }),
  getPurchase: (eventId: UUID, date: string) =>
    http<Purchase>(`/v1/events/${eventId}/purchases/${date}`),
  invalidatePurchase: (eventId: UUID, date: string, reason: string) =>
    http<Purchase>(`/v1/events/${eventId}/purchases/${date}/invalidate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  uploadReceipt: async (eventId: UUID, date: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/v1/events/${eventId}/purchases/${date}/receipt`, {
      method: "POST",
      credentials: "include",
      headers: import.meta.env.DEV ? { "X-Dev-User": localStorage.getItem("devEmail") || "" } : {},
      body: form,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Purchase>;
  },
  getReceiptUrl: (eventId: UUID, date: string) =>
    `${API_URL}/v1/events/${eventId}/purchases/${date}/receipt`,
  listPurchases: (eventId: UUID, start_date?: string, end_date?: string) => {
    const qs = new URLSearchParams();
    if (start_date) qs.set("start_date", start_date);
    if (end_date) qs.set("end_date", end_date);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http<PurchaseSummary[]>(`/v1/events/${eventId}/purchases${suffix}`);
  },
  // Members
  listMembers: (eventId: UUID) => http<Member[]>(`/v1/events/${eventId}/members`),
  removeMember: (eventId: UUID, userId: UUID) =>
    http<void>(`/v1/events/${eventId}/members/${userId}/remove`, { method: "POST" }),
  promoteMember: (eventId: UUID, userId: UUID) =>
    http<void>(`/v1/events/${eventId}/members/${userId}/promote`, { method: "POST" }),
  // Holidays
  getHolidays: (country: string, year: number, region?: string) =>
    http<
      {
        date: string;
        localName: string;
        name: string;
        global: boolean;
        counties?: string[];
        types?: string[];
      }[]
    >(
      `/v1/holidays?country=${encodeURIComponent(country)}&year=${year}${region ? `&region=${encodeURIComponent(region)}` : ""}`,
    ),
  updateEvent: (
    eventId: UUID,
    data: {
      holiday_country_code?: string | null;
      holiday_region_code?: string | null;
      cutoff_time?: string;
      delivery_fee_minor?: number | null;
    },
  ) => http(`/v1/events/${eventId}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteEvent: (eventId: UUID) => http<void>(`/v1/events/${eventId}`, { method: "DELETE" }),
  setMemberNote: (eventId: UUID, note: string | null) =>
    http<{ status: string; note: string | null }>(`/v1/events/${eventId}/members/me/note`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  // Auth
  signup: (email: string, password: string, name?: string, locale?: string) =>
    http<{ message: string }>(`/v1/auth/signup`, {
      method: "POST",
      body: JSON.stringify({ email, password, name, locale }),
    }),
  login: (email: string, password: string) =>
    http<AuthUser>(`/v1/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => http<{ message: string }>(`/v1/auth/logout`, { method: "POST" }),
  refreshToken: () => http<AuthUser>(`/v1/auth/refresh`, { method: "POST" }),
  getAuthMe: () => http<AuthUser>(`/v1/auth/me`),
  verifyEmail: (token: string) =>
    http<{ message: string }>(`/v1/auth/verify-email`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  forgotPassword: (email: string) =>
    http<{ message: string }>(`/v1/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    http<{ message: string }>(`/v1/auth/reset-password`, {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};

export type AuthUser = {
  id: UUID;
  email: string;
  name?: string | null;
  email_verified: boolean;
};
