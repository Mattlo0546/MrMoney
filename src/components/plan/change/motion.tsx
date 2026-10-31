/** Shared scoped styles for the composer, change and offers panels: colour aliases with fallbacks and springy, reduced-motion-safe keyframes. */
export const SCOPE = 'spc';

const CSS = `
.spc{--c-bg:var(--bg,#0B0C1F);--c-surface:var(--surface,#16183A);--c-surface2:var(--surface-2,#20235A);--c-surface-2:var(--surface-2,#20235A);--c-lime-fill:var(--lime-fill,#C8F53C);--c-line:var(--line,#2C3070);
--c-text:var(--text,#F5F5FA);--c-muted:var(--muted,#A3A6D1);--c-accent:var(--accent,#3D5AFE);--c-accent-ink:var(--accent-ink,#fff);
--c-lime:var(--lime,#C8F53C);--c-coral:var(--coral,#FF5A5F);--c-navy:var(--navy,#1B1F5E);color:var(--c-text)}
.spc *{box-sizing:border-box}
.spc .num{font-variant-numeric:tabular-nums}
@keyframes spc-pop{0%{opacity:0;transform:translateY(10px) scale(.96)}60%{opacity:1;transform:translateY(-2px) scale(1.015)}100%{opacity:1;transform:none}}
@keyframes spc-halo{0%{box-shadow:0 0 0 0 rgb(200 245 60 / .45)}100%{box-shadow:0 0 0 10px rgb(200 245 60 / 0)}}
@keyframes spc-spin{to{transform:rotate(360deg)}}
@keyframes spc-dots{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
.spc .pop{animation:spc-pop 420ms cubic-bezier(.34,1.56,.64,1) both}
.spc .halo{animation:spc-halo 900ms ease-out 1}
.spc .spin{animation:spc-spin 800ms linear infinite}
.spc .dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--c-muted);animation:spc-dots 1s ease-in-out infinite}
.spc .dot:nth-child(2){animation-delay:.15s}.spc .dot:nth-child(3){animation-delay:.3s}
.spc .spring{transition:transform 200ms cubic-bezier(.34,1.56,.64,1),background-color 150ms,opacity 150ms}
.spc .spring:hover:not(:disabled){transform:scale(1.05)}
.spc .spring:active:not(:disabled){transform:scale(.95)}
.spc :focus-visible{outline:2px solid var(--c-lime);outline-offset:2px}
@media (prefers-reduced-motion:reduce){
.spc .pop,.spc .spin,.spc .dot{animation:none}
.spc .halo{animation:none;box-shadow:0 0 0 3px rgb(200 245 60 / .5)}
.spc .spring,.spc .spring:hover:not(:disabled),.spc .spring:active:not(:disabled){transition:none;transform:none}
}
`;

export function MotionStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
