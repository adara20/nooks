import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn utility', () => {
  it('returns a single class unchanged', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false, undefined, null, '')).toBe('foo');
  });

  it('resolves tailwind conflicts — last class wins', () => {
    // twMerge ensures bg-red-500 wins over bg-blue-500
    expect(cn('bg-blue-500', 'bg-red-500')).toBe('bg-red-500');
  });

  it('handles conditional classes with objects', () => {
    expect(cn({ 'text-bold': true, 'text-italic': false })).toBe('text-bold');
  });

  it('handles arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('returns empty string when no valid classes provided', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});
