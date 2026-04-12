import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { parseMoneyToMinor } from "../lib/money";
import DateField from "../components/DateField";

export default function NewEvent() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [start, setStart] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = React.useState<string>(() =>
    new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [timezone, setTimezone] = React.useState("Europe/Berlin");
  const [cutoff, setCutoff] = React.useState("20:00");
  const [currency, setCurrency] = React.useState("EUR");
  const [holidayCountry, setHolidayCountry] = React.useState("DE");
  const [holidayRegion, setHolidayRegion] = React.useState("");
  const [items, setItems] = React.useState<{ name: string; price: string }[]>([
    { name: "", price: "" },
  ]);

  function addItem() {
    setItems((arr) => [...arr, { name: "", price: "" }]);
  }
  function updateItem(idx: number, key: "name" | "price", val: string) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  const create = useMutation({
    mutationFn: () => {
      const price_items = items
        .map((it) => ({
          name: it.name.trim(),
          unit_price_minor: parseMoneyToMinor(it.price || ""),
          active: true,
        }))
        .filter((it) => it.name && it.unit_price_minor > 0);
      return api.createEvent({
        name: name.trim(),
        description: description || undefined,
        start_date: start,
        end_date: end,
        timezone,
        cutoff_time: cutoff + ":00".slice(0),
        currency: currency.trim().toUpperCase(),
        price_items,
        holiday_country_code: holidayCountry.trim()
          ? holidayCountry.trim().toUpperCase()
          : undefined,
        holiday_region_code: holidayRegion.trim() ? holidayRegion.trim().toUpperCase() : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      nav("/");
    },
  });

  const disabled =
    !name.trim() ||
    !start ||
    !end ||
    !currency.trim() ||
    items.every((it) => !it.name || parseMoneyToMinor(it.price || "") <= 0);

  return (
    <div>
      <div className="card" style={{ maxWidth: 700 }}>
        <h2>{t("newEvent.title")}</h2>
        <div className="vstack">
          <div className="field">
            <label className="muted">{t("newEvent.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="muted">{t("newEvent.description")}</label>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field">
              <label className="muted">{t("newEvent.start")}</label>
              <DateField
                value={start}
                onChange={(d) => {
                  setStart(d);
                  if (d > end) setEnd(d);
                }}
              />
            </div>
            <div className="field">
              <label className="muted">{t("newEvent.end")}</label>
              <DateField value={end} onChange={setEnd} min={start} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label className="muted">{t("newEvent.timezone")}</label>
              <input
                className="input"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="muted">{t("newEvent.cutoff")}</label>
              <input
                className="input"
                type="time"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
              />
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
              <label className="muted">{t("newEvent.currency")}</label>
              <input
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label className="muted">{t("newEvent.holidayCountry")}</label>
              <input
                className="input"
                placeholder="DE"
                value={holidayCountry}
                onChange={(e) => setHolidayCountry(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="muted">{t("newEvent.holidayRegion")}</label>
              <input
                className="input"
                placeholder="DE-BE"
                value={holidayRegion}
                onChange={(e) => setHolidayRegion(e.target.value)}
              />
            </div>
          </div>
          <div>
            <div style={{ margin: "8px 0" }}>
              <strong>{t("newEvent.priceItems")}</strong>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="row" style={{ marginBottom: 6 }}>
                <input
                  className="input"
                  placeholder={t("newEvent.name")}
                  value={it.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                />
                <input
                  className="input"
                  placeholder={t("newEvent.pricePlaceholder")}
                  value={it.price}
                  onChange={(e) => updateItem(idx, "price", e.target.value)}
                  style={{ width: 160 }}
                />
                <span className="muted">{currency}</span>
                <button onClick={() => removeItem(idx)} className="btn">
                  {t("app.remove")}
                </button>
              </div>
            ))}
            <button onClick={addItem} className="btn" style={{ marginTop: 4 }}>
              {t("newEvent.addItem")}
            </button>
          </div>

          <div className="row">
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending || disabled}
              className="btn primary"
            >
              {create.isPending ? t("newEvent.creating") : t("newEvent.createEvent")}
            </button>
            {create.error && <span className="danger">{String(create.error)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
