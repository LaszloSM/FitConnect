"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import PaymentsClient from "./PaymentsClient";

export default function PaymentsPage() {
  // useSearchParams en el client exige un boundary de Suspense
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
      <PaymentsClient />
    </Suspense>
  );
}



