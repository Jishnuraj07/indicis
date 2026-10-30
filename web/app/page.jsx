import { Suspense } from "react";
import Workspace from "@/components/Workspace.jsx";

export default function Home() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
