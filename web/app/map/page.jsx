import { Suspense } from "react";
import MapView from "@/components/MapView.jsx";

export const metadata = { title: "Map of notes" };

export default function Map() {
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}
