// Stage 0 placeholder page — proves the frontend container serves through
// Caddy. The real dashboard shell (themes, rooms navigation, widgets) is
// built in Stage 4 per docs/specs/theme-tokens.md and widget-contract.md.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">ORBIT</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Stack online — dashboard arrives in Stage 4.
        </p>
      </div>
    </main>
  );
}
