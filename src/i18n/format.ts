export const skDate = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
export const skDateTime = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const skTime = new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit' });
export const skNumber = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 2 });

export function formatDate(date: Date | string | number): string { return skDate.format(new Date(date)); }
export function formatDateTime(date: Date | string | number): string { return skDateTime.format(new Date(date)); }
export function formatTime(date: Date | string | number): string { return skTime.format(new Date(date)); }
export function formatNumber(value: number): string { return skNumber.format(value); }
