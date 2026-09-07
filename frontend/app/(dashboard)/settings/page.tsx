export const dynamic = "force-dynamic";

import { Suspense } from "react";
import SettingsClient from "./SettingsClient";

export default function SettingsPage() {
  // useSearchParams en el client exige un boundary de Suspense
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <SettingsClient />
    </Suspense>
  );
}
