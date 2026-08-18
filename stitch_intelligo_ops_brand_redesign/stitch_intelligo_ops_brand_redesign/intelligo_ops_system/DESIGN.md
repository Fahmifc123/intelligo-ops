---
name: Intelligo Ops System
colors:
  surface: '#faf9fb'
  surface-dim: '#dadadb'
  surface-bright: '#faf9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f5'
  surface-container: '#eeeeef'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e4'
  on-surface: '#1a1c1d'
  on-surface-variant: '#42484c'
  inverse-surface: '#2f3132'
  inverse-on-surface: '#f1f0f2'
  outline: '#72787d'
  outline-variant: '#c2c7cc'
  surface-tint: '#3f6378'
  primary: '#001723'
  on-primary: '#ffffff'
  primary-container: '#002d40'
  on-primary-container: '#7195ac'
  inverse-primary: '#a7cbe4'
  secondary: '#a33800'
  on-secondary: '#ffffff'
  secondary-container: '#cd4800'
  on-secondary-container: '#fffbff'
  tertiary: '#270e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#422108'
  on-tertiary-container: '#b88665'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c4e7ff'
  primary-fixed-dim: '#a7cbe4'
  on-primary-fixed: '#001e2c'
  on-primary-fixed-variant: '#264b5f'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb59a'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#802a00'
  tertiary-fixed: '#ffdcc7'
  tertiary-fixed-dim: '#f3ba97'
  on-tertiary-fixed: '#311300'
  on-tertiary-fixed-variant: '#653d22'
  background: '#faf9fb'
  on-background: '#1a1c1d'
  surface-variant: '#e2e2e4'
  success: '#10B981'
  warning: '#F59E0B'
  neutral-light-bg: '#F8FAFC'
  neutral-dark-bg: '#001B26'
  text-main: '#0F172A'
  text-muted: '#64748B'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 1.5rem
  margin-mobile: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
---

## Brand & Style

This design system is a high-performance extension of the Intelligo ID brand, specifically engineered for operational efficiency and data management. It balances the high-energy "educational spark" of an Edtech platform with the sober reliability of an enterprise SaaS tool.

The visual style is **Corporate / Modern** with subtle **Minimalist** influences. It prioritizes clarity and information density without sacrificing the brand's vibrant identity. The aesthetic is defined by crisp geometry, generous white space, and a sophisticated interplay between deep architectural foundations and energetic orange accents. It should evoke a feeling of "Intellectual Rigor" and "Operational Clarity."

## Colors

The palette is anchored by **Deep Navy (#002D40)**, providing a stable, professional foundation for data-heavy interfaces. **Bright Orange (#FF5C00)** is used sparingly as a high-contrast accent to drive action and highlight critical brand moments.

- **Primary:** Use for navigation bars, primary headers, and high-level structural elements.
- **Secondary:** Use exclusively for primary calls-to-action, active indicators, and critical highlights.
- **Semantic:** Emerald-500 is reserved for "Selesai" (Completed) states, while Amber-500 signals "Belum" (Pending/Warning) states.
- **Backgrounds:** In Light Mode, use a layered approach with pure white surfaces on off-white (#F8FAFC) foundations. In Dark Mode, shift the primary foundation to an even deeper navy (#001B26).

## Typography

This system utilizes a dual-font strategy. **Geist** provides a technical, precise feel for headings and labels, while **Inter** ensures maximum readability for body text and data rows.

- **Headings:** Should always use a Semi-Bold (600) or Bold (700) weight to establish clear hierarchy.
- **Data Display:** For tabular data, use `body-sm` to maintain high information density while preserving legibility.
- **Case:** Labels and badges should use uppercase or sentence case depending on the context, but never title case for technical indicators.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop to ensure data visualization components remain predictable and readable.

- **Desktop (1024px+):** 12-column grid with a 1280px max-width container. Dashboard views primarily use a 2-column "main/sidebar" or equal-split layout for data comparison.
- **Mobile:** Single-column fluid layout with 16px (1rem) side margins.
- **Rhythm:** An 8px linear scale (4, 8, 16, 24, 32, 48, 64) should be followed for all padding and margins. Use `stack-md` (16px) as the default gap for most component groups.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** supplemented by **Low-contrast outlines**. This minimizes visual noise in complex dashboards.

- **Base Layer:** The application background (#F8FAFC).
- **Surface Layer:** White (#FFFFFF) cards and containers with a 1px border (#E2E8F0).
- **Interactive Depth:** On hover, cards should transition from a flat state to a subtle shadow: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`.
- **Focus States:** Active inputs or focused elements utilize a 2px outer ring of the Primary Deep Navy color with a 2px offset to maintain clarity.

## Shapes

The design system employs a "Rounded" geometry to soften the professional tone and make the interface feel more accessible (Edtech influence).

- **Cards/Containers:** Use `rounded-xl` (1.5rem / 24px) to create a modern, friendly frame for content.
- **Buttons/Inputs:** Use `rounded-lg` (0.5rem / 8px) to balance the softer card shapes with a more structured, precise interactive element.
- **Badges/Chips:** Always use a full **Pill-shape** to clearly differentiate status indicators from buttons or cards.

## Components

### Buttons
- **Primary:** Solid Deep Navy background, white Geist medium text. `rounded-lg`.
- **Secondary:** Transparent background, Deep Navy border, Geist medium text.
- **Accent:** Solid Bright Orange for critical actions like "Sign Up" or "Delete".

### Cards
- White background, 1px subtle border, `rounded-xl`. 
- Generous padding (at least `p-6` or 24px).
- Hover state: Slight lift via shadow and subtle border color shift to Primary.

### Navigation
- **Top Bar:** Sticky position, height 64px, blurred background. 
- **Active State:** Underline in Bright Orange or a subtle background tint in Deep Navy (10% opacity).
- **Logo:** Positioned far left, ensuring the Intelligo Ops lockup is legible.

### Badges (Pills)
- Used for "Selesai" (Success) and "Belum" (Warning). 
- Use 10% opacity of the status color for the background and 100% opacity for the text to ensure high legibility and a soft UI feel.

### Forms
- **Inputs:** `rounded-lg`, 1px neutral border. 
- **Focus:** 2px ring in Deep Navy. 
- **Labels:**geist-sm, bold, slightly muted text color to keep the focus on the user input.

### Data Tables
- Clean, borderless rows with 1px bottom dividers.
- Header row uses `label-md` with a subtle gray background.
- Zebra striping is discouraged; use hover highlights instead.