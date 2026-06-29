---
name: Fluid Depth System
colors:
  surface: '#f9f9fc'
  surface-dim: '#dadadc'
  surface-bright: '#f9f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f6'
  surface-container: '#eeeef0'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e5'
  on-surface: '#1a1c1e'
  on-surface-variant: '#3e4944'
  inverse-surface: '#2f3133'
  inverse-on-surface: '#f0f0f3'
  outline: '#6e7a74'
  outline-variant: '#bdc9c2'
  surface-tint: '#006c53'
  primary: '#005f48'
  on-primary: '#ffffff'
  primary-container: '#007a5e'
  on-primary-container: '#a4ffdd'
  inverse-primary: '#79d8b7'
  secondary: '#914c00'
  on-secondary: '#ffffff'
  secondary-container: '#ff8a00'
  on-secondary-container: '#613100'
  tertiary: '#00597d'
  on-tertiary: '#ffffff'
  tertiary-container: '#00739f'
  on-tertiary-container: '#ddf0ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#95f5d2'
  primary-fixed-dim: '#79d8b7'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#00513d'
  secondary-fixed: '#ffdcc4'
  secondary-fixed-dim: '#ffb77f'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6f3900'
  tertiary-fixed: '#c6e7ff'
  tertiary-fixed-dim: '#81cfff'
  on-tertiary-fixed: '#001e2d'
  on-tertiary-fixed-variant: '#004c6b'
  background: '#f9f9fc'
  on-background: '#1a1c1e'
  surface-variant: '#e2e2e5'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 20px
  stack-gap: 16px
  inline-gap: 12px
  section-margin: 32px
---

## Brand & Style
The design system moves away from flat, functional layouts toward a **Fluid High-Depth** aesthetic tailored for high-stakes field operations. It balances institutional reliability with a forward-thinking, premium mobile experience.

The style is characterized by **Layered Glassmorphism** and **Soft-Shadowed Surfaces**. By utilizing translucent materials and multi-layered elevations, the interface provides a clear cognitive hierarchy, making complex data feel lightweight and manageable. The emotional response is one of precision, calm, and technological sophistication. High-contrast semantic accents ensure that critical field alerts and status changes are immediately legible under varying light conditions.

## Colors
The palette is rooted in the institutional heritage of the brand but energized for modern mobile displays.

- **Primary (Institutional Green):** Used for primary actions and brand presence.
- **Secondary (Orange):** Reserved for high-priority interactive elements and progress indicators.
- **Tertiary (Light Blue):** Applied to informational accents and supportive UI elements.
- **Surface Gradients:** Backgrounds utilize soft radial gradients (from #FFFFFF to #F8FAFB) to create a sense of curvature and depth.
- **Semantic Colors:** Enhanced with high-saturation values to ensure visibility for field operations.

## Typography
**Manrope** is used exclusively to maintain a clean, technical, yet approachable personality. The hierarchy is refined to prioritize "scanability" in the field.

- **Scale:** Increased contrast between headlines and body text ensures that section headers act as clear anchors.
- **Weights:** Heavy weights (700-800) are used for headlines to ground the floating card elements.
- **Tracking:** Tightened letter spacing on larger displays for a more "locked-in" professional look; increased tracking on labels for maximum legibility at small sizes.

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous breathing room to accommodate mobile touch targets and reduce visual noise.

- **Rhythm:** Based on an 8px base unit, with a standard 20px margin for mobile containers.
- **Breathing Room:** Increased vertical padding within cards (minimum 16px) to give content a premium, airy feel.
- **Mobile Adaptation:** Uses a single-column layout with "peek" horizontal scrolling for secondary card collections. Avoid cramped multi-column layouts; prioritize vertical flow for field operation speed.

## Elevation & Depth
Depth is the primary communicator of hierarchy. The design system utilizes three distinct layers:

1.  **The Canvas (Level 0):** The base layer, using a subtle gradient background.
2.  **Floating Cards (Level 1):** Main content containers. These use soft, multi-layered shadows (0px 4px 20px rgba(0,0,0,0.04)) to appear lifted off the canvas.
3.  **Active Glass (Level 2):** Overlays, modals, and sticky navigation. These employ a backdrop blur (20px) with a semi-transparent white fill (opacity 80%) and a 1px inner "light-stroke" border to simulate the edge of a glass pane.

## Shapes
The system adopts a **Rounded** philosophy (0.5rem / 8px base) to feel modern and friendly.

- **Primary Cards:** Use `rounded-lg` (16px) to create soft, approachable containers.
- **Interactive Elements:** Buttons and input fields use `rounded-lg` for consistency.
- **Status Indicators:** Pills and chips use fully rounded (pill-shaped) geometry to contrast against the structured rectangular cards.

## Components
- **Buttons:** Primary buttons use the Institutional Green with a subtle vertical gradient and a soft shadow that matches the button color.
- **Cards:** White or slightly translucent backgrounds. Every card must have a 1px border of #E2E8F0 (or white on dark backgrounds) to define its edge against the background blur.
- **Input Fields:** Inset appearance with a 2px focus ring in Institutional Green. Labels are always positioned outside the field for better visibility.
- **Chips/Status:** Use high-contrast vibrant semantic colors (Green, Orange, Red) for text and a 10% opacity background of the same color for high-visibility categorization.
- **Glass Navigation:** A bottom navigation bar using heavy backdrop-blur and semi-transparent backgrounds to maintain context of the content behind it.