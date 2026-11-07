// Visual language: a dark, warm "humidor" palette — Spanish cedar, tobacco leaf,
// aged brass — with generous spacing and a serif display face for headings.
import { Platform } from 'react-native';

export const colors = {
  bg: '#15100C',
  surface: '#1F1813',
  surfaceRaised: '#2A211A',
  border: '#3A2E24',
  text: '#F3E9DC',
  textMuted: '#B5A493',
  textFaint: '#7D6E60',
  brass: '#C9A45C',
  brassDim: '#8E7440',
  cedar: '#B9764A',
  danger: '#D9675A',
  success: '#7FB77E',

  // Flavor-suggestion source colors (used consistently everywhere)
  srcManufacturer: '#C9A45C', // brass — what the maker says
  srcReviews: '#6FA8C9', // slate blue — what reviewers report
  srcBoth: '#7FB77E', // sage — maker and reviewers agree
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const type = {
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.text, fontWeight: '600' as const },
  heading: { fontFamily: fonts.display, fontSize: 20, color: colors.text, fontWeight: '600' as const },
  label: { fontSize: 13, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  caption: { fontSize: 13, color: colors.textMuted },
};
