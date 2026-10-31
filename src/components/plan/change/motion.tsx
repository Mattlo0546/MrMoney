/** Shared scoped styles for the composer, change and offers panels: colour aliases (all read the global tokens in globals.css) and springy, reduced-motion-safe keyframes. */
export const SCOPE = 'spc';

const CSS = `
.spc{--c-bg:var(--bg);--c-surface:var(--surface);--c-surface2:var(--surface-2);--c-surface-2:var(--surface-2);--c-line:var(--line);
--c-text:var(--text);--c-muted:var(--muted);--c-accent:var(--accent);--c-accent-ink:var(--accent-ink);
--c-lime:var(--pos);--c-lime-fill:var(--pos);--c-coral:var(--neg);--c-navy:var(--warn);color:var(--c-text)}
.spc *{box-sizing:border-box}
.spc .num{font-variant-numeric:tabular-nums}
@keyframes spc-pop{0%{opacity:0;transform:translateY(10px) scale(.96)}60%{opacity:1;transform:translateY(-2px) scale(1.015)}100%{opacity:1;transform:none}}
@keyframes spc-halo{0%{box-shadow:0 0 0 0 rgb(124 58 237 / .35)}100%{box-shadow:0 0 0 10px rgb(124 58 237 / 0)}}
@keyframes spc-spin{to{transform:rotate(360deg)}}
@keyframes spc-dots{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
.spc .pop{animation:spc-pop 420ms cubic-bezier(.34,1.56,.64,1) both}
.spc .halo{animation:spc-halo 900ms ease-out 1}
.spc .spin{animation:spc-spin 800ms linear infinite}
.spc .dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--c-muted);animation:spc-dots 1s ease-in-out infinite}
.spc .dot:nth-child(2){animation-delay:.15s}.spc .dot:nth-child(3){animation-delay:.3s}
.spc .spring{transition:transform 200ms cubic-bezier(.34,1.56,.64,1),background-color 150ms,opacity 150ms}
.spc .spring:hover:not(:disabled){transform:scale(1.03)}
.spc .spring:active:not(:disabled){transform:scale(.95)}
@media (prefers-reduced-motion:reduce){
.spc .pop,.spc .spin,.spc .dot{animation:none}
.spc .halo{animation:none;box-shadow:0 0 0 3px rgb(124 58 237 / .45)}
.spc .spring,.spc .spring:hover:not(:disabled),.spc .spring:active:not(:disabled){transition:none;transform:none}
}
`;

export function MotionStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
