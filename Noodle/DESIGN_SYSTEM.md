# Noodle design system

This document defines the styling preferences, color palette, and design tokens for the Noodle extension. **Use these values when adding or changing UI** so the extension stays consistent.

---

## Color palette

### Primary highlight colors (CSS variables)

Use these variables in `styles.css` so highlight colors stay in sync. Do not hardcode hex values for highlights.

| Token | Hex | Usage |
|-------|-----|--------|
| `--highlight-blue` | `#D2DBF2` | Ideas category: toolbar button, snippet border/label, filter dot, in-page highlight |
| `--highlight-green` | `#D2F2ED` | Copy category: same as above |
| `--highlight-coral` | `#FED7CE` | Questions category: same as above; also toggle badge background |

Reference in CSS: `var(--highlight-blue)`, `var(--highlight-green)`, `var(--highlight-coral)`.

### Flash highlight accents (animations)

Used for the temporary “go to source” highlight ring. Keep these in sync with the primary palette (slightly darker/saturated).

| Color | Hex | Usage |
|-------|-----|--------|
| Blue accent | `#7B9BEA` | Flash ring for blue highlights |
| Green accent | `#8ED0C6` | Flash ring for green highlights |
| Coral accent | `#FFA28D` | Flash ring for coral highlights |

### UI neutrals

| Name | Hex | Usage |
|------|-----|--------|
| **Dark surface** | `#292929` | Toolbar background, tooltip background |
| **Primary dark** | `#333` | Active filter button, primary button, toast background, dialog primary button |
| **Primary dark hover** | `#444` | Primary button hover |
| **Heading / strong text** | `#1a1a1a` | Sidebar title, dialog titles |
| **Body text** | `#333` | Snippet text, folder picker, dialog body |
| **Secondary text** | `#555` | Filter button text, folder select |
| **Muted text** | `#666` | Close button, add-folder button, settings button, new-folder row |
| **Placeholder / tertiary** | `#888` | Empty state, snippet folder tag, snippet actions, toggle badge text |
| **Hint / disabled** | `#999` | Meta text, delete-folder button, settings hint, no-folders |
| **Border light** | `#e0e0e0` | Filter buttons, folder select, add-folder, settings button |
| **Border** | `#e5e5e5` | Sidebar border, header/footer borders |
| **Border subtle** | `#eee` | Folder picker divider |
| **Input border** | `#ddd` | Dialog inputs, dialog secondary buttons |
| **Input focus** | `#999` | Focused input/select border |
| **Background light** | `#fafafa` | Sidebar background |
| **Background white** | `#fff` / `white` | Cards, header, footer, dialogs, dropdowns |
| **Background hover** | `#f5f5f5` | Filter hover, folder picker item hover, button hovers |
| **Background subtle** | `#f0f0f0` | Close button hover, snippet action hover, folder tag |
| **Background row** | `#f8f8f8` | Folder row in settings |
| **Toggle / control** | `#4F4D4D` | Floating toggle button, toggle switch when on |
| **Toggle off** | `#ccc` | Toggle switch when off |
| **Destructive hover** | `#e74c3c` | Delete folder button hover |
| **Tooltip / toast text** | `#fff` | Text on dark surfaces |
| **Overlay** | `rgba(0, 0, 0, 0.4)` | Dialog overlay |

### Accent (brand)

| Name | Hex | Usage |
|------|-----|--------|
| **Toggle icon** | `#F0ED95` | Stroke color of the noodle/pen icon on the floating button (inline SVG). |

---

## Typography

- **Font stack**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`  
  Use this for all UI (sidebar, dialogs, tooltips, toasts). Do not introduce other font families.

| Element | Size | Weight | Notes |
|---------|------|--------|--------|
| Sidebar title | 15px | 600 | Header “Noodles” |
| Dialog title (h3) | 16px | 600 | e.g. “Settings”, “New Folder” |
| Dialog section (h4) | 12px | 600 | Uppercase, letter-spacing 0.3px |
| Snippet text | 13px | (normal) | Line-height 1.5 |
| Filter / folder select / settings button | 12px | (normal) | |
| Labels (snippet category, folder tag) | 10px | 600 | Uppercase, letter-spacing 0.3px |
| Meta (timestamp, etc.) | 11px | (normal) | Muted color |
| Tooltip | 11px | (normal) | |
| Toast | 13px | (normal) | |
| Badge | 10px | 600 | Toggle count |
| Close button (×) | 20px | (normal) | |
| Add folder (+) | 18px | (normal) | |
| Toggle icon | 18px (container) | — | SVG scale to fit 22×22px |

---

## Spacing

Use a small set of spacing values for consistency:

| Value | Typical use |
|-------|-------------|
| 2px | Inline gaps (toolbar buttons), highlight padding |
| 4px | Tooltip padding, small icon padding, snippet label padding, border-radius (small) |
| 6px | Filter gap, snippet header gap, border-radius (medium), snippet left border width |
| 8px | Snippet card padding (vertical), snippet margin-bottom, folder picker item padding, dialog button padding |
| 10px | Snippet padding (horizontal), footer padding (vertical), folder row padding |
| 12px | Sidebar/filter padding, snippet padding (horizontal), dialog input padding, folder picker padding |
| 14px | Header padding, snippet header margin-bottom |
| 16px | Header padding (horizontal), dialog title margin-bottom, dialog actions margin-top |
| 20px | Dialog padding, settings section margin-bottom |
| 32px | Add-folder button size (×32) |
| 40px | Empty state padding (vertical) |
| 44px | Floating toggle size (×44) |

Sidebar width: **320px**. Dialog widths: **280px** (default), **320px** (settings dialog).

---

## Border radius

| Token | Value | Use |
|-------|--------|-----|
| Small | 2px | Highlight marks, favicon |
| Medium | 4px | Tooltip, color buttons, snippet labels, snippet actions, close button |
| Medium–large | 6px | Toolbar, folder select, add-folder, settings button, dialog inputs, folder row, dialog buttons |
| Large | 8px | Snippet cards, folder picker, toast |
| X-large | 12px | Modal dialog |
| Pill | 16px | Filter chips |
| Circle | 50% | Toggle button, filter dots |

---

## Shadows

| Use | Value |
|-----|--------|
| Toolbar | `0 2px 8px rgba(0, 0, 0, 0.2)` |
| Snippet card | `0 1px 3px rgba(0, 0, 0, 0.06)` |
| Toggle | `0 2px 12px rgba(0, 0, 0, 0.15)` |
| Toggle hover | `0 4px 16px rgba(0, 0, 0, 0.2)` |
| Folder picker | `0 4px 16px rgba(0, 0, 0, 0.15)` |
| Dialog | `0 8px 32px rgba(0, 0, 0, 0.2)` |

---

## Z-index layers

Use this order so overlays and panels stack correctly. Do not scatter arbitrary z-index values.

| Layer | Z-index | Element |
|-------|---------|---------|
| Toggle | 9998 | Floating toggle button |
| Sidebar | 9999 | Sidebar panel |
| Toolbar | 10000 | Selection toolbar |
| Folder picker / Toast | 10001 | Dropdowns, toasts |
| Dialog overlay | 10002 | Modal overlay |
| Dialog content | (above overlay) | Modal dialog (child of overlay) |
| Tooltip | 10003 | Tooltips |

---

## Motion

- **Duration**: Prefer **0.1s–0.2s** for micro-interactions (hover, focus). **0.25s** for sidebar open/close.
- **Easing**: `ease` or `ease-out` / `ease-in` for in/out.
- **Toolbar**: `toolbarFadeIn` 0.1s ease-out (opacity 0→1, translateY -2px→0).
- **Flash highlight**: 2s ease-out; ring fades over 2s then is removed at 5s (see `content.js`).
- **Toast**: `toastIn` 0.2s, `toastOut` 0.2s starting at 1.8s.
- **Sidebar**: `transform: translateX(100%)` → `translateX(0)` over 0.25s ease.
- **Tooltip**: opacity 0→1 over 0.15s ease after ~400ms delay (see `content.js`).
- **Color button hover**: scale(1.1), 0.1s ease.
- **Toggle switch**: 0.2s ease for background and thumb position.

---

## Component rules

1. **Highlights (in-page)**  
   Use `var(--highlight-blue)`, `var(--highlight-green)`, `var(--highlight-coral)`. Keep border-radius 2px, padding 1px 2px, margin -1px -2px. Hover: `filter: brightness(0.95)`.

2. **Toolbar**  
   Background `#292929`, border-radius 6px, gap 2px, padding 4px 6px. Color buttons 18×18px, border 1.5px solid `rgba(255,255,255,0.2)`, hover `rgba(255,255,255,0.5)`.

3. **Sidebar**  
   Width 320px, background `#fafafa`, left border 1px solid `#e5e5e5`. Header/footer/filters: white background, border-bottom/top `#e5e5e5`.

4. **Snippet cards**  
   White background, 8px border-radius, 3px left border using the category color variable, shadow per table above.

5. **Buttons**  
   - Secondary: white background, border `#e0e0e0` or `#ddd`, hover `#f5f5f5`.  
   - Primary: background `#333`, color white, hover `#444`.  
   - Icon-only: transparent, muted color, hover background `#f0f0f0` and full opacity.

6. **Toggle switch**  
   Off: `#ccc`. On: `#4F4D4D`. Track 36×20px, border-radius 10px. Thumb 16×16px, white, 2px inset.

7. **Floating toggle**  
   Size 44×44px, background `#4F4D4D`, border-radius 50%, cursor grab/grabbing. Badge: coral highlight color, `#333` text, 10px/600, min-width 18px, height 18px, border-radius 9px.

8. **Dialogs**  
   Overlay: full viewport, `rgba(0,0,0,0.4)`. Dialog: white, 12px border-radius, 20px padding, shadow per table. Width 280px (320px for settings).

---

## Don’ts

- Do not add new highlight colors or change the three category colors without updating both `:root` in `styles.css` and the logic in `content.js`.
- Do not use a different font family for the extension UI.
- Do not introduce z-index values outside the defined layers (9998–10003).
- Do not use border-radius or shadow values that aren’t in the tables above unless there’s a clear one-off reason.
- Do not use hardcoded hex for highlight colors; use the CSS variables.

---

## Where to change things

| Change | File |
|--------|------|
| Highlight hex values, UI neutrals, shadows, radii | `src/styles.css` (`:root` and component rules) |
| Flash accent hex values | `src/styles.css` (keyframes `highlightFlash*`) |
| Toggle icon color | `src/styles.css` (`.claude-highlighter-toggle::before` SVG `stroke` in data URI) |
| Default color labels (Ideas, Copy, Questions) | `src/content.js` (`DEFAULT_COLOR_LABELS`) |
| Highlight color hex used in JS (if any) | `src/content.js` (`COLORS` object) |

Keeping these in sync keeps the design system consistent for future developers.
