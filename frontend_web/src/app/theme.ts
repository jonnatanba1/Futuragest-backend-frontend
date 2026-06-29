import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * FuturaGest brand palette — a refined, slightly-desaturated teal.
 * 10 shades from near-white (0) to deep green-teal (9).
 */
const brand: MantineColorsTuple = [
  '#e6faf5', // 0 — very light tint
  '#c0f0e4', // 1
  '#96e4d0', // 2
  '#63d4b8', // 3
  '#33c09f', // 4
  '#12a886', // 5
  '#0a9070', // 6 — primary light
  '#087a5e', // 7
  '#06614b', // 8
  '#044a3a', // 9 — deep
];

export const theme = createTheme({
  // ── Palette ──────────────────────────────────────────────────────────────
  colors: { brand },
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },

  // ── Typography ───────────────────────────────────────────────────────────
  fontFamily:
    "'Inter Variable', system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  headings: {
    fontFamily:
      "'Inter Variable', system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
    fontWeight: '650',
  },

  // ── Tokens ───────────────────────────────────────────────────────────────
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',

  // ── Component defaults ───────────────────────────────────────────────────
  components: {
    Card: {
      defaultProps: {
        radius: 'lg',
        withBorder: true,
      },
      styles: {
        root: {
          boxShadow:
            '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
          transition: 'box-shadow 150ms ease, transform 150ms ease',
        },
      },
    },

    Paper: {
      defaultProps: { radius: 'lg' },
    },

    Button: {
      defaultProps: { radius: 'md' },
      styles: {
        root: { fontWeight: 500 },
      },
    },

    Table: {
      defaultProps: {
        verticalSpacing: 'sm',
        horizontalSpacing: 'md',
      },
    },

    Modal: {
      defaultProps: {
        radius: 'lg',
        overlayProps: { backgroundOpacity: 0.45, blur: 3 },
      },
    },

    Drawer: {
      defaultProps: {
        overlayProps: { backgroundOpacity: 0.45, blur: 3 },
      },
    },

    TextInput: {
      defaultProps: { radius: 'md' },
    },

    Select: {
      defaultProps: { radius: 'md' },
    },

    PasswordInput: {
      defaultProps: { radius: 'md' },
    },

    NumberInput: {
      defaultProps: { radius: 'md' },
    },

    Badge: {
      defaultProps: { radius: 'sm' },
    },

    Tabs: {
      styles: {
        tab: {
          fontWeight: 500,
          transition: 'color 120ms ease',
        },
        list: {
          gap: 4,
        },
      },
    },

    Notification: {
      defaultProps: { radius: 'md' },
    },
  },
});
