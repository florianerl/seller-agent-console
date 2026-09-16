/**
 * Task 1 placeholder. The shell (Task 4) replaces this.
 *
 * `import.meta.env.BASE_URL` is the runtime half of the single source of truth:
 * Vite sets it from `base`, which comes from config/base-path.ts. Application
 * code must never hardcode a path prefix or import the build-time constant.
 */
export function App() {
  return (
    <main>
      <h1>Seller Agent Operator Console</h1>
      <p>
        Scaffold. Served from <code>{import.meta.env.BASE_URL}</code>.
      </p>
    </main>
  );
}
