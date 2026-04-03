# combine-trade Design System

## Design Principles

1. **Data density over decoration** — Every pixel serves the trader. Minimize chrome, maximize information. Tight spacing, compact components, no unnecessary whitespace.
2. **Signal clarity** — Trading states (WATCHING, ENTRY, PROFIT, LOSS, BLOCKED) must be instantly distinguishable through color alone, even in peripheral vision.
3. **Numbers first** — Prices, PnL, sizes, and percentages are the primary content. They get monospace fonts, prominent sizing, and semantic coloring.
4. **Dark by default** — Dark backgrounds reduce eye strain during 24/7 monitoring and make colored indicators pop.
5. **Confidence through precision** — Clean alignments, consistent spacing, and sharp typography convey the systematic, mechanical nature of the trading system.

## Color System

### Primary — Emerald Green

The brand color. Used for primary actions, active states, and the overall identity.

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-50` | `#edfcf2` | — |
| `primary-100` | `#d3f9e0` | — |
| `primary-200` | `#aaf2c6` | — |
| `primary-300` | `#73e5a3` | Light accent text |
| `primary-400` | `#3ad17c` | Hover states |
| `primary-500` | `#17b862` | **Brand primary** — buttons, links, active indicators |
| `primary-600` | `#0a954e` | Primary text on dark bg (WCAG AA: 5.2:1 on `#0a0e14`) |
| `primary-700` | `#097840` | Pressed states |
| `primary-800` | `#0b5f35` | — |
| `primary-900` | `#0a4e2d` | — |
| `primary-950` | `#042c18` | — |

### Secondary — Cyan

Complementary accent for secondary actions, links, and informational highlights.

| Token | Hex | Usage |
|-------|-----|-------|
| `secondary-400` | `#22d3ee` | Secondary links, chart overlays |
| `secondary-500` | `#06b6d4` | Secondary buttons |

### Neutral — Blue-tinted Slate

Cool-toned grays that give the interface a professional terminal aesthetic.

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-50` | `#f8fafc` | — (light mode only) |
| `neutral-100` | `#f1f5f9` | Primary text (dark mode) |
| `neutral-200` | `#e2e8f0` | Headings |
| `neutral-300` | `#cbd5e1` | Strong secondary text |
| `neutral-400` | `#94a3b8` | Muted text, placeholders |
| `neutral-500` | `#64748b` | Disabled text |
| `neutral-600` | `#475569` | Subtle labels |
| `neutral-700` | `#334155` | Borders |
| `neutral-800` | `#1e293b` | Card surfaces |
| `neutral-900` | `#0f172a` | Page background (alt) |
| `neutral-950` | `#020617` | Deepest background |

### Semantic — Trading States

These colors carry meaning. Never use them decoratively.

| Token | Hex | Meaning |
|-------|-----|---------|
| `profit` | `#22c55e` | Profit, long signal, positive PnL |
| `profit-muted` | `#052e16` | Profit row/cell background |
| `loss` | `#ef4444` | Loss, short signal, negative PnL |
| `loss-muted` | `#450a0a` | Loss row/cell background |
| `warning` | `#f59e0b` | Caution, approaching limits |
| `warning-muted` | `#451a03` | Warning background |
| `info` | `#3b82f6` | Informational, neutral data |
| `info-muted` | `#172554` | Info background |
| `watching` | `#a855f7` | WATCHING state — system is scanning for entry |
| `watching-muted` | `#3b0764` | WATCHING state background |
| `trade-block` | `#f97316` | Trade block active — trading suspended |

### Surface Tokens

Abstract roles that compose the dark interface.

| Token | Hex | Role |
|-------|-----|------|
| `background` | `#0a0e14` | App background |
| `background-alt` | `#0f172a` | Alternate/secondary background |
| `card` | `#1e293b` | Card, panel, modal surface |
| `card-hover` | `#263248` | Card hover state |
| `border` | `#334155` | Default border |
| `border-subtle` | `#1e293b` | Subtle divider |
| `foreground` | `#f1f5f9` | Primary text |
| `muted` | `#94a3b8` | Secondary/helper text |

### WCAG Contrast Notes

| Combination | Ratio | Grade |
|-------------|-------|-------|
| `foreground` on `background` | 16.2:1 | AAA |
| `primary-500` on `background` | 8.1:1 | AAA |
| `muted` on `background` | 5.8:1 | AA |
| `profit` on `background` | 8.7:1 | AAA |
| `loss` on `background` | 5.1:1 | AA |

## Typography

### Font Families

| Role | Family | Rationale |
|------|--------|-----------|
| **Primary** | Inter | Clean geometric sans-serif. Excellent readability at small sizes. Tabular number support for data alignment. |
| **Mono** | JetBrains Mono | Prices, sizes, PnL, percentages, code. Clear distinction between similar characters (0/O, 1/l). |

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type Scale (Major Third — 1.25)

| Token | Size | Use |
|-------|------|-----|
| `xs` | 0.75rem (12px) | Labels, captions, timestamps |
| `sm` | 0.875rem (14px) | Secondary text, table cells |
| `base` | 1rem (16px) | Body text |
| `lg` | 1.125rem (18px) | Large body, emphasis |
| `xl` | 1.25rem (20px) | Section titles |
| `2xl` | 1.5rem (24px) | Page headings |
| `3xl` | 1.875rem (30px) | Large headings |
| `4xl` | 2.25rem (36px) | Hero numbers (total PnL) |
| `5xl` | 3rem (48px) | Display (dashboard KPI) |

### Font Weights

| Token | Value | Use |
|-------|-------|-----|
| `light` | 300 | De-emphasized text |
| `regular` | 400 | Body text |
| `medium` | 500 | Labels, table headers |
| `semibold` | 600 | Headings, important values |
| `bold` | 700 | Emphasis, brand text |

### Rules

- **All numeric data** (prices, sizes, PnL, percentages) uses `font-family-mono`
- **Tabular numbers**: Use `font-variant-numeric: tabular-nums` on data columns for alignment
- **Line height**: `tight` (1.25) for headings, `normal` (1.5) for body, `none` (1) for large display numbers

## Spacing & Layout

8px base grid. All spacing values are multiples of 4px.

| Token | Value | Use |
|-------|-------|-----|
| `1` | 4px | Inline icon gap |
| `2` | 8px | Tight element spacing |
| `3` | 12px | Form field padding, compact card padding |
| `4` | 16px | Default card padding, section gap |
| `6` | 24px | Section spacing |
| `8` | 32px | Panel padding |
| `12` | 48px | Major section gap |
| `16` | 64px | Page-level vertical rhythm |

### Layout Patterns

- **Dashboard grid**: CSS Grid, 12-column, `gap: var(--spacing-4)`
- **Data tables**: Compact — `padding: var(--spacing-2) var(--spacing-3)` per cell
- **Cards**: `padding: var(--spacing-4)`, `border-radius: var(--radius-lg)`, `border: 1px solid var(--color-border)`
- **Page margin**: `var(--spacing-6)` on desktop, `var(--spacing-4)` on mobile

## Elevation & Shadows

Shadows are subtle on dark backgrounds. Use sparingly — borders are usually sufficient.

| Token | Use |
|-------|-----|
| `xs` | Dropdowns, tooltips |
| `sm` | Cards (optional — border alone often suffices) |
| `md` | Floating panels |
| `lg` | Modals |
| `xl` | Full-screen overlays |
| `glow-primary` | Active/selected state glow (green) — use on active position cards, selected signals |

## Motion

Trading dashboards need responsive, non-distracting transitions.

| Token | Duration | Use |
|-------|----------|-----|
| `fast` | 100ms | Hover states, button press feedback |
| `normal` | 200ms | Panel expand/collapse, tab switch |
| `slow` | 300ms | Modal enter/exit, page transition |

**Rules:**
- Use `ease-out` for entrances (element appearing)
- Use `ease-in` for exits (element disappearing)
- Use `ease` for state changes (hover, toggle)
- **Never animate price/PnL number changes** — instant updates prevent cognitive lag
- Pulse animations allowed for: new signal alert, WATCHING state indicator

## Component Patterns

### Naming Convention

CSS custom properties follow: `--{category}-{name}-{variant}`
- `--color-primary-500`
- `--font-size-sm`
- `--spacing-4`

### State Patterns

| State | Treatment |
|-------|-----------|
| **Default** | Base token values |
| **Hover** | Lighten surface by one step (e.g., `card` → `card-hover`) |
| **Focus** | `outline: 2px solid var(--color-primary-500); outline-offset: 2px` |
| **Active/Pressed** | Darken by one step (e.g., `primary-500` → `primary-700`) |
| **Disabled** | `opacity: 0.5; pointer-events: none` |
| **Loading** | Skeleton pulse with `background: var(--color-border-subtle)` |

### Trading-Specific Components

**PnL Display:**
```css
.pnl { font-family: var(--font-family-mono); font-weight: var(--font-weight-semibold); }
.pnl--profit { color: var(--color-profit); }
.pnl--loss { color: var(--color-loss); }
```

**Signal Badge:**
```css
.badge { padding: var(--spacing-1) var(--spacing-2); border-radius: var(--radius-full); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
.badge--watching { background: var(--color-watching-muted); color: var(--color-watching); }
.badge--trade-block { background: var(--color-warning-muted); color: var(--color-trade-block); }
.badge--long { background: var(--color-profit-muted); color: var(--color-profit); }
.badge--short { background: var(--color-loss-muted); color: var(--color-loss); }
```

**Data Table:**
```css
.table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.table th { color: var(--color-muted); font-weight: var(--font-weight-medium); text-align: left; padding: var(--spacing-2) var(--spacing-3); border-bottom: 1px solid var(--color-border); }
.table td { padding: var(--spacing-2) var(--spacing-3); border-bottom: 1px solid var(--color-border-subtle); }
.table tr:hover { background: var(--color-card-hover); }
```

## Dark Mode

Dark mode is the **default and primary** theme. No light mode is planned.

All surface tokens are calibrated for dark backgrounds:
- `background`: `#0a0e14` (near-black with blue undertone)
- `card`: `#1e293b` (raised surface)
- `foreground`: `#f1f5f9` (near-white text)

If light mode is ever needed, override surface tokens under `[data-theme="light"]`.

## Usage Examples

### Import tokens in CSS

```css
@import './assets/tokens.css';

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-family-primary);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
}
```

### React component example

```tsx
function PositionCard({ ticket }) {
  const isPnlPositive = ticket.pnl.greaterThan(0);

  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-4)',
    }}>
      <span style={{
        fontFamily: 'var(--font-family-mono)',
        fontWeight: 'var(--font-weight-semibold)',
        color: isPnlPositive ? 'var(--color-profit)' : 'var(--color-loss)',
      }}>
        {ticket.pnl.toFixed(2)} USDT
      </span>
    </div>
  );
}
```

### Monospace for all numbers

```css
.price, .size, .pnl, .percentage, [data-numeric] {
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}
```
