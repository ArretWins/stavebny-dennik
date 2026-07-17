export const colors = {
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primarySoft: '#EAF4E8',
  warning: '#EF6C00',
  warningSoft: '#FFF4E5',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F5EF',
  border: '#E0DED9',
  text: '#111827',
  textMuted: '#6B7280',
  danger: '#C62828',
  overlay: 'rgba(17, 24, 39, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 16,
} as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const typeScale = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  topBar: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  section: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export const shadows = {
  card: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export const theme = { colors, spacing, radius, typeScale, shadows };
