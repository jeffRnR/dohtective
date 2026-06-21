// app/loading.tsx
import Loader from "./frontend/components/Loader";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bone)" }}>
      <Loader label="Loading..." size="lg" />
    </div>
  );
}
