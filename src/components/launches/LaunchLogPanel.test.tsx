import { describe, it, expect } from 'vitest';
import { statusLabel } from './LaunchLogPanel';

describe('statusLabel', () => {
  it('maps statuses to human labels', () => {
    expect(statusLabel('launched')).toBe('Launched');
    expect(statusLabel('pending')).toBe('Waiting for home');
    expect(statusLabel('expired')).toBe('Expired (home was offline)');
    expect(statusLabel('failed')).toBe('Failed');
  });

  it('passes through unknown status strings', () => {
    expect(statusLabel('completed')).toBe('Completed');
    expect(statusLabel('mystery')).toBe('mystery');
  });
});
