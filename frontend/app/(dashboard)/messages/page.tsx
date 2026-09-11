import { Suspense } from "react";
import MessagesClient from "./MessagesClient";

export default function MessagesPage() {
  // `useSearchParams` dentro del cliente: sin Suspense el prerender del build
  // de producción falla (no el dev server, ni `tsc`).
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
      <MessagesClient />
    </Suspense>
  );
}
