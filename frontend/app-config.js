const base = String(window.NEXARO_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
export const API_BASE_URL = base || `${location.protocol}//${location.hostname}:8787/api`;
