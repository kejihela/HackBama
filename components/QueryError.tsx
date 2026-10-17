"use client";

import { useSearchParams } from "next/navigation";

/** Shows ?error=… from the URL. For layouts, which can't read search params on the server. */
export function QueryError() {
  const error = useSearchParams().get("error");
  return error ? <div className="alert error">{error}</div> : null;
}
