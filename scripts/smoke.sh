#!/usr/bin/env bash
set -euo pipefail

# Simple smoke test for Mampfi API endpoints.
# Requirements: curl, jq

BASE_URL=${BASE_URL:-http://localhost:8000}
DEV_USER=${DEV_USER:-you@example.com}

hdr=(-H "X-Dev-User: ${DEV_USER}" -H "Content-Type: application/json")

echo "Using BASE_URL=${BASE_URL} DEV_USER=${DEV_USER}"

today=$(date -u +%F)
end_date=$(date -u -v+5d +%F 2>/dev/null || date -u -d "+5 days" +%F)
tomorrow=$(date -u -v+1d +%F 2>/dev/null || date -u -d "+1 day" +%F)
day_after=$(date -u -v+2d +%F 2>/dev/null || date -u -d "+2 days" +%F)
yesterday=$(date -u -v-1d +%F 2>/dev/null || date -u -d "-1 day" +%F)

echo "Creating event..."
create_payload=$(cat <<JSON
{
  "name": "Smoke Test Event",
  "description": "auto-created for smoke",
  "start_date": "${today}",
  "end_date": "${end_date}",
  "timezone": "Europe/Berlin",
  "cutoff_time": "20:00:00",
  "currency": "EUR",
  "price_items": [
    {"name": "Coffee", "unit_price_minor": 250},
    {"name": "Bread", "unit_price_minor": 120}
  ]
}
JSON
)

event_json=$(curl -sS -X POST "${BASE_URL}/v1/events" "${hdr[@]}" -d "${create_payload}")
echo "Event response:"
echo "${event_json}" | jq . >/dev/null
event_id=$(echo "${event_json}" | jq -r .id)
echo "event_id=${event_id}"

echo "Listing price items..."
items_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/price-items" "${hdr[@]}")
echo "Price items:"
echo "${items_json}" | jq . >/dev/null
first_item=$(echo "${items_json}" | jq -r '.[0].id')
echo "first price_item_id=${first_item}"

echo "Upserting my order for ${tomorrow}..."
order_payload=$(cat <<JSON
{
  "date": "${tomorrow}",
  "items": [ {"price_item_id": "${first_item}", "qty": 2} ]
}
JSON
)
curl -sS -X PUT "${BASE_URL}/v1/events/${event_id}/orders/${tomorrow}/me" "${hdr[@]}" -d "${order_payload}" -o /dev/null -w "%{http_code}\n"

echo "Fetching my order..."
curl -sS "${BASE_URL}/v1/events/${event_id}/orders/${tomorrow}/me" "${hdr[@]}" | jq .

echo "Aggregating orders..."
curl -sS "${BASE_URL}/v1/events/${event_id}/orders/aggregate?date=${tomorrow}" "${hdr[@]}" | jq .

echo "Fetching purchase for day after (expect 404)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" "${BASE_URL}/v1/events/${event_id}/purchases/${day_after}" "${hdr[@]}")
echo "purchase fetch HTTP code=${code} (expected 404)"

echo "Finalizing purchase from aggregate (with allocations)..."
agg_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/orders/aggregate?date=${tomorrow}" "${hdr[@]}")
# Build lines from aggregate to include allocations
lines=$(echo "${agg_json}" | jq '[.items[] | select((.total_qty // 0) > 0) | {
  type: "price_item",
  price_item_id: .price_item_id,
  qty_final: (.total_qty // 0),
  unit_price_minor: (.unit_price_minor // 0),
  allocations: ((.consumers // []) | map({ user_id: .user_id, qty: (.qty // 0) }))
}]')
purchase_payload=$(jq -n --arg date "${tomorrow}" --arg notes "smoke purchase" --argjson lines "${lines}" '{date: $date, lines: $lines, notes: $notes}')
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/purchases" "${hdr[@]}" -d "${purchase_payload}" | jq .

# Assert balances net to zero after purchase finalization
sum_after_purchase=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}" | jq '([.totals[].balance_minor] | add) // 0')
echo "Balances sum after purchase: ${sum_after_purchase} (expected 0)"
if [ "${sum_after_purchase}" != "0" ]; then
  echo "ERROR: balances do not net to zero after purchase"
  exit 1
fi

echo "Finalizing purchase again (expect 409)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/purchases" "${hdr[@]}" -d "${purchase_payload}")
echo "second finalize HTTP code=${code} (expected 409)"

echo "Creating group invite..."
invite_resp=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/invites/group" "${hdr[@]}" -d '{"ttl_days":14}')
echo "${invite_resp}" | jq .
token=$(echo "${invite_resp}" | jq -r .token)
invite_id=$(echo "${invite_resp}" | jq -r .invite.id)

echo "Listing invites (owner)..."
curl -sS "${BASE_URL}/v1/events/${event_id}/invites" "${hdr[@]}" | jq .

echo "Joining as non-owner member via invite..."
hdr_member=(-H "X-Dev-User: other@example.com" -H "Content-Type: application/json")
curl -sS -X POST "${BASE_URL}/v1/invites/redeem" "${hdr_member[@]}" -d "{\"token\":\"${token}\"}" | jq .

echo "Attempt list invites as non-owner (expect 403)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" "${BASE_URL}/v1/events/${event_id}/invites" "${hdr_member[@]}")
echo "non-owner list invites HTTP code=${code} (expected 403)"

echo "Attempt create group invite as non-owner (expect 403)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/invites/group" "${hdr_member[@]}" -d '{"ttl_days":14}')
echo "non-owner create group invite HTTP code=${code} (expected 403)"

echo "Attempt revoke invite as non-owner (expect 403)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/invites/${invite_id}/revoke" "${hdr_member[@]}")
echo "non-owner revoke invite HTTP code=${code} (expected 403)"

echo "Event access as non-member third user (expect 403)..."
hdr_third=(-H "X-Dev-User: third@example.com" -H "Content-Type: application/json")
code=$(curl -sS -o /dev/null -w "%{http_code}\n" "${BASE_URL}/v1/events/${event_id}" "${hdr_third[@]}")
echo "third user GET event HTTP code=${code} (expected 403)"

echo "Create single-use invite and redeem twice (second should 400)..."
single_inv=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/invites/single" "${hdr[@]}" -d '{"ttl_days":14}')
echo "${single_inv}" | jq .
single_token=$(echo "${single_inv}" | jq -r .token)
echo "Redeem single invite as third user (join)..."
curl -sS -X POST "${BASE_URL}/v1/invites/redeem" "${hdr_third[@]}" -d "{\"token\":\"${single_token}\"}" | jq .
echo "Redeem single invite again (expect 400)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/invites/redeem" "${hdr_third[@]}" -d "{\"token\":\"${single_token}\"}")
echo "second redeem HTTP code=${code} (expected 400)"

echo "Creating a payment from owner to member..."
# Determine the other user's id by fetching their "my order" (ensures user exists and returns user_id)
other_user_id=$(curl -sS "${BASE_URL}/v1/events/${event_id}/orders/${tomorrow}/me" "${hdr_member[@]}" | jq -r .user_id)
owner_user_id=$(curl -sS "${BASE_URL}/v1/events/${event_id}/orders/${tomorrow}/me" "${hdr[@]}" | jq -r .user_id)

create_payment_payload=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 777,
  "note": "smoke payment"
}
JSON
)
pay_json=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${create_payment_payload}")
echo "Payment create:"
echo "${pay_json}" | jq .
payment_id=$(echo "${pay_json}" | jq -r .id)

echo "Recipient confirms payment..."
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments/${payment_id}/confirm" "${hdr_member[@]}" | jq .

echo "List payments filtered by status=confirmed..."
curl -sS "${BASE_URL}/v1/events/${event_id}/payments?status=confirmed" "${hdr[@]}" | jq .

echo "Create another pending payment for guard checks..."
create_payment_payload2=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 888,
  "note": "guard checks"
}
JSON
)
p2=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${create_payment_payload2}")
echo "${p2}" | jq .
p2_id=$(echo "${p2}" | jq -r .id)

echo "Confirm by proposer (expect 403)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments/${p2_id}/confirm" "${hdr[@]}")
echo "proposer confirm HTTP code=${code} (expected 403)"

echo "Cancel by recipient (expect 403)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments/${p2_id}/cancel" "${hdr_member[@]}")
echo "recipient cancel HTTP code=${code} (expected 403)"

echo "Confirm properly as recipient..."
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments/${p2_id}/confirm" "${hdr_member[@]}" | jq .

echo "Confirm again (expect 400)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments/${p2_id}/confirm" "${hdr_member[@]}")
echo "second confirm HTTP code=${code} (expected 400)"

echo "Cancel after confirm (expect 400)..."
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments/${p2_id}/cancel" "${hdr[@]}")
echo "cancel after confirm HTTP code=${code} (expected 400)"

echo "Cutoff lock: upsert for today (expect 403)..."
order_today=$(cat <<JSON
{
  "date": "${today}",
  "items": [ {"price_item_id": "${first_item}", "qty": 1} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X PUT "${BASE_URL}/v1/events/${event_id}/orders/${today}/me" "${hdr[@]}" -d "${order_today}")
echo "upsert today HTTP code=${code} (expected 403)"

echo "Event bounds: upsert before start_date (yesterday, expect 400)..."
order_yesterday=$(cat <<JSON
{
  "date": "${yesterday}",
  "items": [ {"price_item_id": "${first_item}", "qty": 1} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X PUT "${BASE_URL}/v1/events/${event_id}/orders/${yesterday}/me" "${hdr[@]}" -d "${order_yesterday}")
echo "upsert yesterday HTTP code=${code} (expected 400)"

echo "Invalid order qty (negative, expect 400)..."
bad_order=$(cat <<JSON
{
  "date": "${tomorrow}",
  "items": [ {"price_item_id": "${first_item}", "qty": -1} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X PUT "${BASE_URL}/v1/events/${event_id}/orders/${tomorrow}/me" "${hdr[@]}" -d "${bad_order}")
echo "negative qty HTTP code=${code} (expected 400)"

echo "Invalid purchase line type (expect 400)..."
bad_purchase=$(cat <<JSON
{
  "date": "${day_after}",
  "lines": [ {"type": "invalid", "qty_final": 1, "unit_price_minor": 100} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/purchases" "${hdr[@]}" -d "${bad_purchase}")
echo "invalid line type HTTP code=${code} (expected 422)"

echo "Invalid price_item_id for price_item line (expect 400)..."
bad_purchase_pid=$(cat <<JSON
{
  "date": "${day_after}",
  "lines": [ {"type": "price_item", "price_item_id": "00000000-0000-0000-0000-000000000000", "qty_final": 1, "unit_price_minor": 100} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/purchases" "${hdr[@]}" -d "${bad_purchase_pid}")
echo "unknown price_item_id HTTP code=${code} (expected 400)"

echo "Invalid allocations sum (expect 400)..."
bad_alloc=$(cat <<JSON
{
  "date": "${day_after}",
  "lines": [ {"type": "price_item", "price_item_id": "${first_item}", "qty_final": 1, "unit_price_minor": 100, "allocations": []} ]
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/purchases" "${hdr[@]}" -d "${bad_alloc}")
echo "allocations sum mismatch HTTP code=${code} (expected 400)"

echo "Payments: amount 0 (expect 400)..."
zero_payment=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 0,
  "note": "zero"
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${zero_payment}")
echo "amount 0 HTTP code=${code} (expected 400)"

echo "Payments: negative amount (expect 400)..."
neg_payment=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": -5,
  "note": "neg"
}
JSON
)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${neg_payment}")
echo "amount -5 HTTP code=${code} (expected 400)"

echo "Payments: list as non-member outsider (expect 403)..."
hdr_outsider=(-H "X-Dev-User: outsider@example.com" -H "Content-Type: application/json")
code=$(curl -sS -o /dev/null -w "%{http_code}\n" "${BASE_URL}/v1/events/${event_id}/payments" "${hdr_outsider[@]}")
echo "outsider list payments HTTP code=${code} (expected 403)"

echo "Balances overview..."
bal_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
echo "${bal_json}" | jq . >/dev/null
sum_now=$(echo "${bal_json}" | jq '([.totals[].balance_minor] | add) // 0')
echo "Balances sum now: ${sum_now} (expected 0)"
if [ "${sum_now}" != "0" ]; then
  echo "ERROR: balances do not net to zero"
  exit 1
fi

echo "Balances delta checks with payments..."
# Fetch balances before
before_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
before_owner=$(echo "${before_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
before_member=$(echo "${before_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')

echo "Create + confirm payment 321 minor; expect +321 owner, -321 member"
pay_delta=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 321,
  "note": "delta check"
}
JSON
)
pdelta=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${pay_delta}")
pdelta_id=$(echo "${pdelta}" | jq -r .id)
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments/${pdelta_id}/confirm" "${hdr_member[@]}" >/dev/null
after_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
after_owner=$(echo "${after_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
after_member=$(echo "${after_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
echo "owner delta: $((after_owner - before_owner)) (expected 321)"
echo "member delta: $((after_member - before_member)) (expected -321)"
# Net to zero check
sum_after=$(echo "${after_json}" | jq '([.totals[].balance_minor] | add) // 0')
echo "Balances sum after confirm: ${sum_after} (expected 0)"
if [ "${sum_after}" != "0" ]; then
  echo "ERROR: balances do not net to zero after confirm"
  exit 1
fi

echo "Decline payment 222; expect no balance change"
before_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
before_owner=$(echo "${before_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
before_member=$(echo "${before_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
pay_decl=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 222,
  "note": "no-change"
}
JSON
)
pd=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${pay_decl}")
pd_id=$(echo "${pd}" | jq -r .id)
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments/${pd_id}/decline" "${hdr_member[@]}" -d '{"reason":"test"}' >/dev/null
after_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
after_owner=$(echo "${after_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
after_member=$(echo "${after_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
echo "owner delta after decline: $((after_owner - before_owner)) (expected 0)"
echo "member delta after decline: $((after_member - before_member)) (expected 0)"
# Net to zero check
sum_after=$(echo "${after_json}" | jq '([.totals[].balance_minor] | add) // 0')
echo "Balances sum after decline: ${sum_after} (expected 0)"
if [ "${sum_after}" != "0" ]; then
  echo "ERROR: balances do not net to zero after decline"
  exit 1
fi

echo "Cancel payment 333; expect no balance change"
before_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
before_owner=$(echo "${before_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
before_member=$(echo "${before_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
pay_can=$(cat <<JSON
{
  "to_user_id": "${other_user_id}",
  "amount_minor": 333,
  "note": "no-change-cancel"
}
JSON
)
pc=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments" "${hdr[@]}" -d "${pay_can}")
pc_id=$(echo "${pc}" | jq -r .id)
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/payments/${pc_id}/cancel" "${hdr[@]}" >/dev/null
after_json=$(curl -sS "${BASE_URL}/v1/events/${event_id}/balances" "${hdr[@]}")
after_owner=$(echo "${after_json}" | jq -r --arg uid "${owner_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
after_member=$(echo "${after_json}" | jq -r --arg uid "${other_user_id}" '[.totals[] | select(.user_id==$uid) | .balance_minor] | first // 0')
echo "owner delta after cancel: $((after_owner - before_owner)) (expected 0)"
echo "member delta after cancel: $((after_member - before_member)) (expected 0)"
# Net to zero check
sum_after=$(echo "${after_json}" | jq '([.totals[].balance_minor] | add) // 0')
echo "Balances sum after cancel: ${sum_after} (expected 0)"
if [ "${sum_after}" != "0" ]; then
  echo "ERROR: balances do not net to zero after cancel"
  exit 1
fi

echo "Invite revoke then redeem (expect 400 after revoke)..."
rev_inv=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/invites/single" "${hdr[@]}" -d '{"ttl_days":14}')
rev_token=$(echo "${rev_inv}" | jq -r .token)
rev_id=$(echo "${rev_inv}" | jq -r .invite.id)
curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/invites/${rev_id}/revoke" "${hdr[@]}" -o /dev/null -w "%{http_code}\n" >/dev/null
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/invites/redeem" "${hdr_outsider[@]}" -d "{\"token\":\"${rev_token}\"}")
echo "redeem after revoke HTTP code=${code} (expected 400)"

echo "Invite expired (ttl_days=0, expect 400 on redeem)..."
exp_inv=$(curl -sS -X POST "${BASE_URL}/v1/events/${event_id}/invites/single" "${hdr[@]}" -d '{"ttl_days":0}')
exp_token=$(echo "${exp_inv}" | jq -r .token)
code=$(curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/v1/invites/redeem" "${hdr_outsider[@]}" -d "{\"token\":\"${exp_token}\"}")
echo "redeem expired HTTP code=${code} (expected 400)"

echo "Smoke test completed."
