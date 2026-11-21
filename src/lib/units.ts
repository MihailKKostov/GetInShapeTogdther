import type { Units } from '../data/types';

export const KG_PER_LB = 0.45359237;
export const M_PER_MI = 1609.344;

export function fmtNum(n: number | undefined | null, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function weightUnit(u: Units) {
  return u === 'imperial' ? 'lb' : 'kg';
}

export function kgTo(u: Units, kg: number): number {
  return u === 'imperial' ? kg / KG_PER_LB : kg;
}

export function toKg(u: Units, v: number): number {
  return u === 'imperial' ? v * KG_PER_LB : v;
}

export function fmtWeight(u: Units, kg: number | undefined | null, signed = false): string {
  if (kg == null) return '—';
  const v = kgTo(u, kg);
  const s = fmtNum(Math.abs(v), 1);
  const sign = signed ? (v > 0.05 ? '+' : v < -0.05 ? '−' : '±') : v < 0 ? '−' : '';
  return `${sign}${s} ${weightUnit(u)}`;
}

export function fmtHeight(u: Units, cm: number | undefined | null): string {
  if (cm == null) return '—';
  if (u === 'imperial') {
    const inches = Math.round(cm / 2.54);
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function distUnit(u: Units) {
  return u === 'imperial' ? 'mi' : 'km';
}

export function mTo(u: Units, m: number): number {
  return u === 'imperial' ? m / M_PER_MI : m / 1000;
}

export function toM(u: Units, v: number): number {
  return u === 'imperial' ? v * M_PER_MI : v * 1000;
}

export function fmtDist(u: Units, m: number): string {
  return `${fmtNum(mTo(u, m), 2)} ${distUnit(u)}`;
}

export function fmtElev(u: Units, m: number): string {
  return u === 'imperial' ? `${fmtNum(m * 3.28084)} ft` : `${fmtNum(m)} m`;
}

/** Pace per km/mi as m:ss. */
export function fmtPace(u: Units, m: number, sec: number): string {
  if (m < 10 || sec <= 0) return '—';
  const per = sec / mTo(u, m);
  const mm = Math.floor(per / 60);
  const ss = Math.round(per % 60);
  return `${mm}:${String(ss === 60 ? 59 : ss).padStart(2, '0')} /${distUnit(u)}`;
}

export function fmtSpeed(u: Units, m: number, sec: number): string {
  if (m < 10 || sec <= 0) return '—';
  return `${fmtNum(mTo(u, m) / (sec / 3600), 1)} ${u === 'imperial' ? 'mph' : 'km/h'}`;
}
