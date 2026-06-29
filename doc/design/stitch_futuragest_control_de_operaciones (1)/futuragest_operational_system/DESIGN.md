---
name: FuturaGest Operational System
colors:
  surface: '#f7fafc'
  surface-dim: '#d7dadc'
  surface-bright: '#f7fafc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f6'
  surface-container: '#ebeef0'
  surface-container-high: '#e5e9eb'
  surface-container-highest: '#e0e3e5'
  on-surface: '#181c1e'
  on-surface-variant: '#3e4a3f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eef1f3'
  outline: '#6e7a6f'
  outline-variant: '#bdcabc'
  surface-tint: '#006d37'
  primary: '#006633'
  on-primary: '#ffffff'
  primary-container: '#008243'
  on-primary-container: '#dcffe0'
  inverse-primary: '#73dc92'
  secondary: '#a63b00'
  on-secondary: '#ffffff'
  secondary-container: '#ff6a24'
  on-secondary-container: '#5a1c00'
  tertiary: '#4e596d'
  on-tertiary: '#ffffff'
  tertiary-container: '#667186'
  on-tertiary-container: '#f4f6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#8ff9ac'
  primary-fixed-dim: '#73dc92'
  on-primary-fixed: '#00210d'
  on-primary-fixed-variant: '#005228'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#f7fafc'
  on-background: '#181c1e'
  surface-variant: '#e0e3e5'
  success: '#008243'
  warning: '#EA5B13'
  surface-white: '#FFFFFF'
  text-dark: '#000000'
typography:
  headline-xl:
    fontFamily: Montserrat
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 16px
  margin-desktop: 32px
  gutter: 24px
  container-max: 1440px
---

## Brand & Style

The design system is engineered for a robust SaaS environment dedicated to operational management and industrial cleaning services. It prioritizes **efficiency, reliability, and clarity**, catering to administrative staff and field supervisors who require a tool that remains legible during high-velocity tasks.

The visual direction follows a **Corporate Modern** aesthetic. It leverages ample whitespace to reduce cognitive load while maintaining a high-density information architecture suitable for data-heavy dashboards and logistics tracking. The interface communicates "operational excellence" through precision, a structured grid, and a professional color application that bridges the gap between environmental responsibility and industrial strength.

## Colors

The palette is rooted in the corporate identity of Futuraseo. 
- **Primary (#008243):** This environmental green is used for core actions, branding, and status indicators representing "active" or "completed" states.
- **Secondary (#EA5B13):** A high-visibility orange reserved for critical alerts, urgent operational tasks, and call-to-action buttons that require immediate attention.
- **Tertiary (#1E293B):** A deep slate blue-gray (derived for the SaaS context) used for navigation sidebars and headers to provide a grounded, professional structure.
- **Neutral (#F2F5F7):** A cool-toned gray used for backgrounds to reduce eye strain compared to pure white, allowing the primary content cards to pop.

## Typography

This design system exclusively utilizes **Montserrat** to maintain consistency with the official brand. The type scale is optimized for legibility in complex data tables and operational forms. 

- **Headlines:** Use heavy weights (700) for major section titles and dashboard summaries. Tighten letter spacing slightly on larger displays for a more modern, compact feel.
- **Body:** Standardized at 16px for desktop comfort. Use 14px for secondary information or sidebar metadata.
- **Labels:** Uppercase styles are utilized for table headers and small tags to differentiate them clearly from interactive text.

## Layout & Spacing

This design system employs a **12-column fixed-width grid** for desktop dashboards, centering content at a maximum width of 1440px to ensure accessibility on large monitors. 

- **Spacing Rhythm:** Based on an 8px linear scale. Most component padding should utilize 16px (2x) or 24px (3x) intervals.
- **Mobile Reflow:** On mobile devices, the 12-column grid collapses into a single-column layout with 16px side margins. Large data tables must implement horizontal scrolling with sticky primary columns to maintain operational utility.
- **Sidebars:** Fixed at 260px for desktop to provide a persistent navigation anchor.

## Elevation & Depth

To maintain a "clean and functional" feel, depth is conveyed through **Tonal Layering** rather than heavy shadows.

- **Level 0 (Background):** Neutral #F2F5F7.
- **Level 1 (Cards/Content):** Pure White #FFFFFF with a subtle 1px border (#E2E8F0) and no shadow. This creates a "flat-modern" look that feels more precise.
- **Level 2 (Modals/Dropdowns):** Pure White with an ambient, diffused shadow (0px 4px 20px rgba(0,0,0,0.08)) to indicate temporary interaction layers.
- **Level 3 (Active Elements):** Items being dragged or prioritized receive a slight green-tinted shadow to reinforce the primary brand color.

## Shapes

The design system uses a **Soft (0.25rem / 4px)** roundedness strategy. This geometric, slightly squared-off approach reinforces the industrial and professional nature of the cleaning and logistics sector. 

- **Standard Buttons & Inputs:** 4px radius.
- **Status Tags/Chips:** 16px (Pill) to differentiate them from interactive buttons.
- **Data Cards:** 8px radius to provide a softer container for dense information.

## Components

- **Buttons:** Primary buttons use the corporate green with white text. Secondary buttons use a green outline. "Emergency" or "Alert" buttons use the secondary orange.
- **Input Fields:** Standardized with a 1px gray border that turns primary green on focus. Labels must always be visible above the field for operational clarity.
- **Data Tables:** High-density layout. Alternating row colors (Zebra striping) using the neutral background color for enhanced readability of long logistics lists.
- **Status Chips:** Use high-contrast backgrounds (e.g., light green background with dark green text) for quick scanning of task statuses (Pending, In Progress, Completed).
- **KPI Cards:** Feature large "Headline-XL" numbers to highlight critical metrics like "Personnel on Site" or "Pending Routes" at a glance.
- **Navigation:** A dark sidebar (Tertiary color) with white or light gray icons provides high contrast and a sense of "command center" authority.