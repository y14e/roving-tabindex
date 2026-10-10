import { DIRECTIONS } from '@/constants';
import type { Direction, RovingTabIndexOptions as Options } from '@/types';

export function resolveOptions(options: Partial<Options>): Options {
  let {
    direction = 'both',
    navigationOnly = false,
    noMemory = false,
    noStart = false,
    selector = '',
    typeahead = false,
    wrap = false,
  } = options;

  if (typeof direction === 'string') {
    direction = direction.toLowerCase() as Direction;
  }

  if (!DIRECTIONS.includes(direction)) {
    console.warn("Invalid direction option. Fallback: 'both'.");
    direction = 'both';
  }

  if (typeof navigationOnly !== 'boolean') {
    console.warn('Invalid navigationOnly option. Fallback: false.');
    navigationOnly = false;
  }

  if (typeof noMemory !== 'boolean') {
    console.warn('Invalid noMemory option. Fallback: false.');
    noMemory = false;
  }

  if (typeof noStart !== 'boolean') {
    console.warn('Invalid noStart option. Fallback: false.');
    noStart = false;
  }

  if (selector !== '') {
    try {
      document.querySelector(selector);
    } catch {
      console.warn('Invalid selector. Fallback: no selector string.');
      selector = '';
    }
  }

  if (typeof typeahead !== 'boolean') {
    console.warn('Invalid typeahead option. Fallback: false.');
    typeahead = false;
  }

  if (typeof wrap !== 'boolean') {
    console.warn('Invalid wrap option. Fallback: false.');
    wrap = false;
  }

  return {
    direction,
    navigationOnly,
    noMemory,
    noStart,
    selector,
    typeahead,
    wrap,
  };
}
