import { Suspense } from "react";
import RoutinesClient from "./RoutinesClient";

export const dynamic = "force-dynamic";

export default function RoutinesPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-xl" />}>
      <RoutinesClient />
    </Suspense>
  );
}
