import React from "react";

export function Table({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={["table", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </table>
  );
}
