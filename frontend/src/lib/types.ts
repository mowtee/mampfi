/** Domain types shared across the EventDetail page and API layer. */

export type AggregateConsumer = {
  user_id: string;
  qty: number;
};

export type AggregateItem = {
  price_item_id: string;
  name: string;
  total_qty: number;
  unit_price_minor: number;
  item_total_minor: number;
  consumers: AggregateConsumer[];
};

export type Aggregate = {
  date: string;
  total_minor: number;
  items: AggregateItem[];
};

export type Allocation = {
  user_id: string;
  qty: number;
};

export type PurchaseLine = {
  price_item_id?: string;
  name?: string;
  qty_final: number;
  unit_price_minor: number;
  allocations?: Allocation[];
};

export type Purchase = {
  event_id: string;
  date: string;
  buyer_id: string;
  finalized_at: string;
  total_minor: number;
  notes?: string | null;
  lines: PurchaseLine[];
};

export type PurchaseSummary = {
  event_id: string;
  date: string;
  buyer_id: string;
  finalized_at: string;
  total_minor: number;
  notes?: string | null;
};

export type Payment = {
  id: string;
  event_id: string;
  from_user_id: string;
  to_user_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  note?: string | null;
  created_at: string;
  decided_at?: string | null;
  version: number;
};

export type Invite = {
  id: string;
  event_id: string;
  expires_at: string;
  revoked_at?: string | null;
  max_uses?: number | null;
  used_count: number;
  last_used_at?: string | null;
};

export type BalanceLine = {
  user_id: string;
  balance_minor: number;
  wants_to_leave?: boolean;
};

export type Balances = {
  currency: string;
  totals: BalanceLine[];
};

export type LeavePlanAction =
  | { action: "pay"; to_user_id: string; amount_minor: number }
  | { action: "receive"; from_user_id: string; amount_minor: number };

export type LeaveErrorPayload = {
  reason: "balance_not_zero";
  currency: string;
  balance_minor: number;
  plan: LeavePlanAction[];
};
