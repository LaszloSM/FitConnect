"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import MembersClient from "./MembersClient";

export default function MembersPage() {
  // useSearchParams en el client exige un boundary de Suspense
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <MembersClient />
    </Suspense>
  );
}



