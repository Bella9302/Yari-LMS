/**
 * Shown on demonstration servers only (DEMO_MODE=true), so nobody mistakes demo data for real
 * people. Read straight from process.env: the root layout renders at build time too, before the
 * full environment exists.
 */
export function DemoBanner() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <div
      role="note"
      className="bg-inverse text-on-inverse px-4 py-1.5 text-center font-mono text-[0.7rem] tracking-[0.12em] uppercase"
    >
      Demonstration site · all people and data are fictional · emails are not sent
    </div>
  );
}
