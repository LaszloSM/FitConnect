"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import ReportsClient from "./ReportsClient";

export default function ReportsPage() {
  // useSearchParams en el client exige un boundary de Suspense
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <ReportsClient />
    </Suspense>
  );
}



