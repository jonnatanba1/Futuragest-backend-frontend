---
name: Arbor Global
colors:
  surface: '#f9f9ff'
  surface-dim: '#c6dbff'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d4e3ff'
  on-surface: '#041c37'
  on-surface-variant: '#3e4a3d'
  inverse-surface: '#1c314d'
  inverse-on-surface: '#ebf1ff'
  outline: '#6e7a6c'
  outline-variant: '#becaba'
  surface-tint: '#006e29'
  primary: '#006b27'
  on-primary: '#ffffff'
  primary-container: '#048734'
  on-primary-container: '#f7fff2'
  inverse-primary: '#70dd7f'
  secondary: '#9d4400'
  on-secondary: '#ffffff'
  secondary-container: '#fd7200'
  on-secondary-container: '#582300'
  tertiary: '#006673'
  on-tertiary: '#ffffff'
  tertiary-container: '#008091'
  on-tertiary-container: '#f8fdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#8cfa98'
  primary-fixed-dim: '#70dd7f'
  on-primary-fixed: '#002107'
  on-primary-fixed-variant: '#00531d'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb68f'
  on-secondary-fixed: '#331100'
  on-secondary-fixed-variant: '#773200'
  tertiary-fixed: '#a1efff'
  tertiary-fixed-dim: '#44d8f1'
  on-tertiary-fixed: '#001f25'
  on-tertiary-fixed-variant: '#004e59'
  background: '#f9f9ff'
  on-background: '#041c37'
  surface-variant: '#d4e3ff'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 16px
  container-max: 1280px
---

## Brand & Style

This design system is built for a brand that bridges environmental stewardship with modern data management. The brand personality is **optimistic, grounded, and systematically organized**. It targets professional sectors in forestry, agriculture, and land management who require high-density information tools that still feel connected to the natural world.

The visual style is **Corporate / Modern with a Tactile twist**. It utilizes a clean, systematic foundation while incorporating subtle depth and organic color transitions inspired by the provided isotype. The goal is to evoke a sense of "digital nature"—where data feels as tangible and vital as the environments it represents.

## Colors

The palette is directly extracted from the brand isotype to ensure total visual continuity.
- **Primary Green (#0D8A37):** Used for main actions, active states, and brand-heavy components.
- **Secondary Orange (#FF7300):** Employed for accents, warnings, and high-visibility status indicators.
- **Tertiary Light Blue (#00BCD4):** Used for information callouts, interactive links, and secondary data visualizations.
- **Dark Blue Neutral (#1A2F4B):** Derived from the deepest shadows of the logo’s environment, used for typography and structural backgrounds to ground the vibrant brand colors.
- **Light Green Accent (#79C142):** Used for success states and background fills to provide a softer tonal variation of the primary brand color.

## Typography

The typography strategy balances high-end corporate precision with technical clarity.
- **Hanken Grotesk** is used for headlines to provide a sharp, contemporary look that feels professional and forward-thinking.
- **Work Sans** serves as the workhorse for body copy, offering exceptional readability for data-heavy management interfaces.
- **JetBrains Mono** is utilized for labels, metadata, and technical identifiers, reinforcing the "precision management" aspect of the brand.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 
- **Rhythm:** All spacing is based on a 4px baseline power-of-two scale (4, 8, 16, 24, 32, 48, 64).
- **Density:** High-density layouts are preferred for dashboards, using 8px padding for internal card components and 24px for external gutters.
- **Reflow:** On tablet, columns collapse to 8; on mobile, all elements stack vertically with fixed side margins of 16px to maximize readable area.

## Elevation & Depth

To mirror the layered nature of the isotype, the design system uses **Tonal Layering** combined with **Soft Ambient Shadows**. 
- **Surface Levels:** The background is a very light grey or off-white. Cards sit on "Surface Level 1" with a subtle 1px border in a muted version of the Neutral Blue.
- **Depth:** Active elements like buttons or hovered cards use a "Low-contrast outline" mixed with a soft shadow (0px 4px 20px rgba(26, 47, 75, 0.08)) to create a tactile, pressable feel without appearing "heavy."
- **Focus:** High-priority modals use a backdrop blur (8px) to isolate the user's attention, maintaining a clean, modern aesthetic.

## Shapes

The shape language is **Rounded**, reflecting the organic curves of the isotype's tree and waves. 
- **Standard Radius:** 0.5rem (8px) for cards, input fields, and buttons.
- **Large Radius:** 1rem (16px) for major containers and featured promotional blocks.
- **Pill Shapes:** Reserved exclusively for status tags and chips (e.g., "Active", "Pending") to differentiate them from interactive buttons.

## Components

- **Buttons:** Primary buttons use the Brand Green with white text. Secondary buttons use a ghost style with a Dark Blue border and text. Accent buttons for specific "Alert" actions use the Brand Orange.
- **Chips & Tags:** Small, pill-shaped elements. Use the Light Green Accent for positive status, Light Blue for informational metadata, and Orange for "Needs Attention."
- **Input Fields:** 8px rounded corners with a subtle 1px border. On focus, the border transitions to Primary Green with a soft outer glow.
- **Cards:** White backgrounds with an 8px radius and a very thin (0.5px) Neutral Blue border.
- **Lists:** High-density rows with divider lines in a 5% opacity Neutral Blue. Hover states use a 2% opacity Neutral Blue fill.
- **Data Visuals:** Charts should default to the primary green, using the orange and blues for multi-series data to maintain brand consistency across analytics.