import type { DIRECTIONS } from '@/constants';

export interface RovingTabIndexOptions {
  direction: Direction;
  navigationOnly: boolean;
  noMemory: boolean;
  noStart: boolean;
  selector: string;
  typeahead: boolean;
  wrap: boolean;
}

export type Direction = (typeof DIRECTIONS)[number];
