/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 3.2.0
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/roving-tabindex}
 */

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import {
  addTokenToAttribute,
  restoreAttributes,
  saveAttributes,
} from '@y14e/attributes-utils';
import { focusElement, getActiveElement, getFocusables } from 'power-focusable';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RovingTabIndexOptions {
  direction: RovingTabIndexDirection;
  navigationOnly: boolean;
  noMemory: boolean;
  noStart: boolean;
  selector: string;
  typeahead: boolean;
  wrap: boolean;
}

type RovingTabIndexDirection = 'both' | 'grid' | 'horizontal' | 'vertical';

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------

export function createRovingTabIndex(
  container: Element,
  options: Partial<RovingTabIndexOptions> = {},
): () => void {
  if (!(container instanceof Element)) {
    console.warn('Invalid container element');
    return () => {};
  }

  try {
    const roving = new RovingTabIndex(container, options);
    return () => roving.destroy();
  } catch (error) {
    error instanceof Error && console.warn(error.message || error);
    return () => {};
  }
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

class RovingTabIndex {
  static #initialized = new Set<Element>();

  #container: Element;
  #settings: Partial<RovingTabIndexOptions>;
  #focusables = new Set<Element>();
  #focusablesByFirstChar = new Map<string, Element[]>();
  #selectorFilter: (_: Element) => boolean;
  #controller: AbortController | null = null;
  #isDestroyed = false;

  constructor(
    container: Element,
    options: Partial<RovingTabIndexOptions> = {},
  ) {
    this.#container = container;
    let {
      direction = 'both',
      navigationOnly = false,
      noMemory = false,
      noStart = false,
      selector = '',
      typeahead = false,
      wrap = false,
    } = options;

    if (!['both', 'grid', 'horizontal', 'vertical'].includes(direction)) {
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

    if (selector !== '' && (typeof selector !== 'string' || !selector.trim())) {
      console.warn('Invalid selector. Fallback: no selector string.');
      selector = '';
    }

    if (typeof typeahead !== 'boolean') {
      console.warn('Invalid typeahead option. Fallback: false.');
      typeahead = false;
    }

    if (typeof wrap !== 'boolean') {
      console.warn('Invalid wrap option. Fallback: false.');
      wrap = false;
    }

    this.#settings = {
      direction,
      navigationOnly,
      noMemory,
      noStart,
      selector,
      typeahead,
      wrap,
    };
    this.#selectorFilter = this.#createSelectorFilter();
    this.#initialize();
  }

  destroy(): void {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    this.#controller?.abort();
    this.#controller = null;
    restoreAttributes([...this.#focusables]);
    this.#focusables.clear();
    this.#focusablesByFirstChar.clear();
  }

  #initialize(): void {
    this.#update(getActiveElement());
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    this.#container.addEventListener('focusin', this.#onFocusIn, { signal });
    this.#settings.noMemory &&
      this.#container.addEventListener('focusout', this.#onFocusOut, {
        signal,
      });
    this.#container.addEventListener('keydown', this.#onKeyDown, { signal });
  }

  #onFocusIn = (event: Event): void => {
    if (!(event instanceof FocusEvent)) {
      return;
    }

    const { target } = event;
    target instanceof Element && this.#update(target);
  };

  #onFocusOut = (event: Event): void => {
    if (!(event instanceof FocusEvent)) {
      return;
    }

    const target = event.relatedTarget;
    (!(target instanceof Element) || !this.#focusables.has(target)) &&
      this.#update();
  };

  #onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const { direction, typeahead, wrap = false } = this.#settings;
    const isGrid = direction === 'grid';
    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;

    if (
      (!(isGrid && ['End', 'Home'].includes(key)) && ctrlKey) ||
      altKey ||
      metaKey ||
      shiftKey
    ) {
      return;
    }

    const isBoth = direction === 'both';
    const isHorizontal = direction === 'horizontal';

    if (
      ![
        'End',
        'Home',
        ...(isGrid || isBoth
          ? ['ArrowLeft', 'ArrowUp']
          : [`Arrow${isHorizontal ? 'Left' : 'Up'}`]),
        ...(isGrid || isBoth
          ? ['ArrowRight', 'ArrowDown']
          : [`Arrow${isHorizontal ? 'Right' : 'Down'}`]),
      ].includes(key)
    ) {
      if (
        !typeahead ||
        !/^\S$/i.test(key) ||
        !this.#focusablesByFirstChar.has(key.toUpperCase())
      ) {
        return;
      }
    }

    const active = getActiveElement();

    if (!(active instanceof Element)) {
      return;
    }

    const current = this.#getFocusables();

    if (!current.includes(active)) {
      return;
    }

    event.preventDefault();
    const currentIndex = current.indexOf(active);
    let newIndex: number;
    let target = current;

    switch (key) {
      case 'End':
      case 'Home': {
        const rawIndex = key === 'End' ? -1 : 0;

        if (isGrid && !ctrlKey) {
          const cell = this.#getCellsInActiveRow().at(rawIndex);
          newIndex = cell ? current.indexOf(cell) : currentIndex;
        } else {
          newIndex = rawIndex;
        }

        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowRight':
      case 'ArrowDown': {
        if (['ArrowUp', 'ArrowDown'].includes(key) && isGrid) {
          const cell = this.#getNextCell(key, wrap);
          newIndex = cell ? current.indexOf(cell) : currentIndex;
        } else {
          if (isGrid) {
            target = this.#getCellsInActiveRow();
          }

          const isPrevious = ['ArrowLeft', 'ArrowUp'].includes(key);
          const rawIndex =
            (isGrid ? target.indexOf(active) : currentIndex) +
            (isPrevious ? -1 : 1);
          newIndex = isPrevious
            ? wrap
              ? rawIndex
              : Math.max(rawIndex, 0)
            : wrap
              ? rawIndex % target.length
              : Math.min(rawIndex, target.length - 1);
        }

        break;
      }
      default: {
        // Typeahead
        target = this.#focusablesByFirstChar.get(key.toUpperCase()) ?? [];
        const foundIndex = target.findIndex(
          (focusable) => current.indexOf(focusable) > currentIndex,
        );
        newIndex = foundIndex >= 0 ? foundIndex : 0;
      }
    }

    const focusable = target.at(newIndex);
    focusable && focusElement(focusable);
  };

  #update(active?: Element | null): void {
    const current = new Set(this.#getFocusables());

    // Removed
    for (const focusable of this.#focusables) {
      if (!current.has(focusable)) {
        focusable.isConnected && restoreAttributes([focusable]);
        this.#focusables.delete(focusable);
        this.#focusablesByFirstChar.forEach((focusables) => {
          const index = focusables.indexOf(focusable);
          index >= 0 && focusables.splice(index, 1);
        });
      }
    }

    const { navigationOnly, noStart, typeahead } = this.#settings;

    // Added
    for (const focusable of current) {
      if (this.#focusables.has(focusable)) {
        continue;
      }

      if (RovingTabIndex.#initialized.has(focusable)) {
        throw new TypeError('Already initialized');
      }

      this.#focusables.add(focusable);
      RovingTabIndex.#initialized.add(focusable);

      if (!navigationOnly) {
        saveAttributes([focusable], ['tabindex']);
        focusable.setAttribute('tabindex', '-1');
      }

      if (!typeahead) {
        continue;
      }

      // Typeahead
      const char = focusable.textContent?.trim()?.at(0)?.toUpperCase();
      const value = focusable.ariaKeyShortcuts?.trim();
      const keys = new Set(
        value
          ? value
              .split(/\s+/)
              .filter((key) => /^\S$/i.test(key))
              .map((key) => key.toUpperCase())
          : [],
      );

      if (char) {
        keys.add(char);
        saveAttributes([focusable], ['aria-keyshortcuts']);
        addTokenToAttribute(focusable, 'aria-keyshortcuts', char, {
          caseInsensitive: true,
        });
      }

      keys.forEach((key) => {
        const focusables = this.#focusablesByFirstChar.get(key) ?? [];
        focusables.push(focusable);
        this.#focusablesByFirstChar.set(key, focusables);
      });
    }

    if (!navigationOnly) {
      if (active && this.#focusables.has(active)) {
        this.#focusables.forEach((focusable) => {
          focusable.setAttribute('tabindex', focusable === active ? '0' : '-1');
        });
      } else {
        [...this.#focusables].forEach((focusable, i) => {
          focusable.setAttribute('tabindex', i || noStart ? '-1' : '0');
        });
      }
    }
  }

  #createSelectorFilter(): (element: Element) => boolean {
    const { selector } = this.#settings;
    return (element) =>
      !selector ||
      [...this.#container.querySelectorAll(selector)].includes(element);
  }

  #getFocusables(): Element[] {
    return getFocusables(this.#container, {
      composed: true,
      filter: this.#selectorFilter,
      skipNegativeTabIndexCheck: !this.#settings.navigationOnly,
      skipVisibilityCheck: true,
    });
  }

  #getNextCell(key: string, wrap: boolean): Element | null {
    const cells = this.#getFocusables();
    const active = getActiveElement();

    if (!(active instanceof Element)) {
      return null;
    }

    function getCoords(element: Element): { x: number; y: number } {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    const activeCoords = getCoords(active);
    let min = Infinity;
    let result: Element | null = null;

    for (const cell of cells) {
      if (cell === active) {
        continue;
      }

      const cellCoords = getCoords(cell);
      const distances = {
        x: Math.abs(cellCoords.x - activeCoords.x),
        y: Math.abs(cellCoords.y - activeCoords.y),
      };

      if (
        (key === 'ArrowUp' &&
          cellCoords.y < activeCoords.y &&
          distances.x < distances.y) ||
        (key === 'ArrowDown' &&
          cellCoords.y > activeCoords.y &&
          distances.x < distances.y)
      ) {
        const distance = distances.x ** 2 + distances.y ** 2;

        if (distance < min) {
          min = distance;
          result = cell;
        }
      }
    }

    if (!result && wrap) {
      let max = -Infinity;

      for (const cell of cells) {
        if (cell === active) {
          continue;
        }

        const cellCoords = getCoords(cell);

        if (
          Math.abs(cellCoords.x - activeCoords.x) <
          cell.getBoundingClientRect().width / 2
        ) {
          const distance =
            key === 'ArrowUp'
              ? cellCoords.y - activeCoords.y
              : activeCoords.y - cellCoords.y;

          if (distance > max) {
            max = distance;
            result = cell;
          }
        }
      }
    }

    return result;
  }

  #getCellsInActiveRow(): Element[] {
    const active = getActiveElement();

    if (!(active instanceof Element)) {
      return [];
    }

    const activeRect = active.getBoundingClientRect();
    return this.#getFocusables().filter((cell) => {
      const cellRect = cell.getBoundingClientRect();
      return (
        cellRect.top < activeRect.bottom && cellRect.bottom > activeRect.top
      );
    });
  }
}
