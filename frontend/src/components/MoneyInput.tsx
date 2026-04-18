import React from "react";
import { filterMoneyInput } from "../lib/money";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (v: string) => void;
};

/**
 * Text input that accepts only currency amounts: digits plus a single comma or
 * dot and up to two fractional digits. Everything else is stripped on input
 * (including paste). Storage is a string; pass the value through
 * `parseMoneyToMinor` at submit time.
 */
export default function MoneyInput({ value, onChange, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      className={["input", className].filter(Boolean).join(" ")}
      value={value}
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]{0,2}"
      onChange={(e) => onChange(filterMoneyInput(e.target.value))}
    />
  );
}
