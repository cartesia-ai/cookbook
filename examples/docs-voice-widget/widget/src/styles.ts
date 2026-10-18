import { DARK, FONT_STACK, LIGHT, cssVars } from './tokens';

export const STYLES = `
:host { all: initial; ${cssVars(LIGHT)} color-scheme: light; }
:host([data-theme="dark"]) { ${cssVars(DARK)} color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
.root { font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.5; color: var(--foreground); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }
svg { display: block; flex-shrink: 0; }
[hidden] { display: none !important; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 16px; border: 1px solid transparent; border-radius: 8px; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background-color .15s, color .15s, border-color .15s; outline: none; }
.btn:focus-visible { box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent); border-color: var(--ring); }
.btn:disabled { opacity: .5; pointer-events: none; }
.btn svg { width: 16px; height: 16px; }
.btn-primary { background: var(--primary); color: var(--primary-foreground); }
.btn-primary:hover { background: color-mix(in oklab, var(--primary) 90%, transparent); }
.btn-outline { background: var(--background); border-color: var(--border); box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05); }
.btn-outline:hover { background: var(--accent); color: var(--accent-foreground); }
:host([data-theme="dark"]) .btn-outline { background: color-mix(in oklab, var(--input) 30%, transparent); border-color: var(--input); }
.btn-end { background: color-mix(in oklab, var(--destructive) 10%, transparent); border-color: color-mix(in oklab, var(--destructive) 30%, transparent); color: var(--destructive); }
.btn-end:hover { background: color-mix(in oklab, var(--destructive) 15%, transparent); }
:host([data-theme="dark"]) .btn-end { background: color-mix(in oklab, var(--destructive) 15%, transparent); border-color: color-mix(in oklab, var(--destructive) 40%, transparent); }
.btn-ghost { background: transparent; }
.btn-ghost:hover { background: var(--accent); color: var(--accent-foreground); }
.icon-sm { width: 32px; height: 32px; padding: 0; }
.icon { width: 36px; height: 36px; padding: 0; }
.btn[aria-pressed="true"] { color: var(--destructive); border-color: color-mix(in oklab, var(--destructive) 40%, transparent); }

.trigger { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; height: 40px; padding: 0 16px 0 14px; border-radius: 9999px; }
.trigger.open { width: 40px; padding: 0; background: var(--card); color: var(--foreground); border-color: var(--border); box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05); }
.trigger.open:hover { background: var(--accent); color: var(--accent-foreground); }

.panel { position: fixed; right: 16px; left: 16px; bottom: 68px; z-index: 2147483000; display: flex; flex-direction: column; height: min(560px, calc(100dvh - 96px)); background: var(--card); color: var(--card-foreground); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05); overflow: hidden; opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
.panel.open { opacity: 1; transform: none; pointer-events: auto; }
@media (min-width: 640px) { .panel { left: auto; width: 380px; right: 24px; bottom: 76px; } .trigger { right: 24px; bottom: 24px; } }
@media (prefers-reduced-motion: reduce) { .panel, .orb, .orb::after { transition: none !important; animation: none !important; } }

.head { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 12px 0 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.head h2 { margin: 0; font-size: 14px; font-weight: 600; }

.body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; overscroll-behavior: contain; }
.stage { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 4px; }
.status { font-size: 13px; color: var(--muted-foreground); min-height: 20px; text-align: center; max-width: 280px; }

.orb { position: relative; width: 88px; height: 88px; border-radius: 9999px; background: var(--orb-idle, var(--muted)); border: 1px solid var(--border); transition: background-color .25s, transform .25s, border-color .25s; }
:host([data-theme="dark"]) { --orb-idle: var(--secondary); }
.orb::after { content: ""; position: absolute; inset: -7px; border-radius: inherit; border: 2px solid transparent; transition: border-color .25s; }
.orb[data-state="connecting"]::after { border-color: var(--border); border-top-color: var(--primary); animation: spin 1s linear infinite; }
.orb[data-state="listening"] { background: var(--accent); border-color: color-mix(in oklab, var(--primary) 35%, transparent); }
.orb[data-state="listening"][data-user="1"] { transform: scale(1.06); }
.orb[data-state="listening"][data-user="1"]::after { border-color: color-mix(in oklab, var(--primary) 45%, transparent); }
.orb[data-state="thinking"] { background: var(--accent); border-color: color-mix(in oklab, var(--primary) 35%, transparent); animation: breathe 1.6s ease-in-out infinite; }
.orb[data-state="speaking"] { background: var(--primary); border-color: var(--primary); animation: talk .9s ease-in-out infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { 50% { transform: scale(.94); } }
@keyframes talk { 50% { transform: scale(1.08); } }

.hint { margin: 0; padding: 16px; border: 1px dashed var(--border); border-radius: 14px; text-align: center; }
.hint p { margin: 0; }
.hint .t { font-size: 14px; font-weight: 500; }
.hint .d { margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--muted-foreground); }

.log { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.msg { max-width: 88%; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; background: var(--muted); padding: 8px 12px; border-radius: 14px 14px 4px 14px; }
:host([data-theme="dark"]) .msg.user { background: var(--secondary); }
.msg.assistant { align-self: flex-start; }
.msg.live { color: var(--muted-foreground); }

.sources { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 12px; font-weight: 500; color: var(--muted-foreground); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 28px; padding: 0 12px 0 10px; border-radius: 9999px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); font-size: 12px; font-weight: 500; text-decoration: none; cursor: pointer; }
.chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip svg { width: 14px; height: 14px; }
.chip:hover { border-color: color-mix(in oklab, var(--primary) 40%, transparent); }
.chip.on { background: var(--accent); color: var(--accent-foreground); border-color: color-mix(in oklab, var(--primary) 30%, transparent); }
.chip:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent); }

.alert { display: grid; grid-template-columns: 16px 1fr; gap: 2px 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--destructive); font-size: 14px; }
.alert svg { width: 16px; height: 16px; margin-top: 3px; grid-row: span 2; }
.alert .t { font-weight: 500; }
.alert .d { font-size: 13px; color: color-mix(in oklab, var(--destructive) 90%, transparent); }

.foot { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
.foot .grow { flex: 1; }
`;
