import {
  addAttributeToken,
  restoreAttributes,
  saveAttributes,
} from '@y14e/attribute-utils';
import { focusElement, getActiveElement, getFocusables } from 'power-focusable';

export interface RovingTabIndexOptions {
  direction: Direction;
  navigationOnly: boolean;
  noMemory: boolean;
  noStart: boolean;
  selector: string;
  typeahead: boolean;
  wrap: boolean;
}

type Direction = (typeof DIRECTIONS)[number];

const DIRECTIONS = ['both', 'grid', 'horizontal', 'vertical'] as const;

export function createRovingTabIndex(
  container: Element,
  options: Partial<RovingTabIndexOptions> = {},
): () => void {
  if (!(container instanceof Element)) {
    console.warn('Invalid container element');
    return () => {};
  }

  const rovingTabIndex = new RovingTabIndex(container, options);
  return () => rovingTabIndex.destroy();
}

class RovingTabIndex {
  static #initialized = new Set<Element>();

  #container: Element;
  #settings: RovingTabIndexOptions;
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
    this.#settings = this.#resolveOptions(options);
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

    for (const focusable of this.#focusables) {
      RovingTabIndex.#initialized.delete(focusable);
      restoreAttributes(focusable);
    }

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

    const candidates = this.#getFocusables().filter((f) =>
      this.#focusables.has(f),
    );

    const active = getActiveElement();

    if (!(active instanceof Element)) {
      return;
    }

    if (!candidates.includes(active)) {
      return;
    }

    event.preventDefault();
    let newIndex: number;
    const activeIndex = candidates.indexOf(active);
    let target = candidates;

    switch (key) {
      case 'End':
      case 'Home': {
        const rawIndex = key === 'End' ? -1 : 0;

        if (isGrid && !ctrlKey) {
          const cell = this.#getCellsOfActiveRow().at(rawIndex);
          newIndex = cell ? candidates.indexOf(cell) : activeIndex;
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
          newIndex = cell ? candidates.indexOf(cell) : activeIndex;
        } else {
          if (isGrid) {
            target = this.#getCellsOfActiveRow();
          }

          const isPrevious = ['ArrowLeft', 'ArrowUp'].includes(key);
          const rawIndex =
            (isGrid ? target.indexOf(active) : activeIndex) +
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
        const focusablesByFirstChar = new Set(
          this.#focusablesByFirstChar.get(key.toUpperCase()) ?? [],
        );
        target = candidates.filter((c) => focusablesByFirstChar.has(c));
        const afterIndex = target.findIndex(
          (f) => candidates.indexOf(f) > activeIndex,
        );
        newIndex = afterIndex >= 0 ? afterIndex : 0;
      }
    }

    const focusable = target.at(newIndex);
    focusable && focusElement(focusable);
  };

  #update(active?: Element | null): void {
    const current = new Set(this.#getFocusables());

    // Removed
    for (const focusable of this.#focusables) {
      if (current.has(focusable)) {
        continue;
      }

      RovingTabIndex.#initialized.delete(focusable);
      restoreAttributes(focusable);
      this.#focusables.delete(focusable);

      for (const [key, focusables] of this.#focusablesByFirstChar) {
        const index = focusables.indexOf(focusable);

        if (index >= 0) {
          focusables.splice(index, 1);
          !focusables.length && this.#focusablesByFirstChar.delete(key);
        }
      }
    }

    const { navigationOnly, noStart, typeahead } = this.#settings;

    // Added
    for (const focusable of current) {
      if (this.#focusables.has(focusable)) {
        continue;
      }

      if (RovingTabIndex.#initialized.has(focusable)) {
        continue;
      }

      this.#focusables.add(focusable);
      RovingTabIndex.#initialized.add(focusable);

      if (!navigationOnly) {
        saveAttributes(focusable, 'tabindex');
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
              .filter((k) => /^\S$/i.test(k))
              .map((k) => k.toUpperCase())
          : [],
      );

      if (char) {
        keys.add(char);
        saveAttributes(focusable, 'aria-keyshortcuts');
        addAttributeToken(focusable, 'aria-keyshortcuts', char, {
          caseInsensitive: true,
        });
      }

      for (const key of keys) {
        const focusables = this.#focusablesByFirstChar.get(key) ?? [];
        focusables.push(focusable);
        this.#focusablesByFirstChar.set(key, focusables);
      }
    }

    if (!navigationOnly) {
      if (active && this.#focusables.has(active)) {
        for (const focusable of this.#focusables) {
          focusable.setAttribute('tabindex', focusable === active ? '0' : '-1');
        }
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

  #getCellCoords(cell: Element): { x: number; y: number } {
    const { left, top, width, height } = cell.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
  }

  #getCellsOfActiveRow(): Element[] {
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

    const activeCoords = this.#getCellCoords(active);
    let min = Infinity;
    let result: Element | null = null;

    for (const cell of cells) {
      if (cell === active) {
        continue;
      }

      const cellCoords = this.#getCellCoords(cell);
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

        const cellCoords = this.#getCellCoords(cell);

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

  #resolveOptions(
    options: Partial<RovingTabIndexOptions>,
  ): RovingTabIndexOptions {
    let {
      direction = 'both',
      navigationOnly = false,
      noMemory = false,
      noStart = false,
      selector = '',
      typeahead = false,
      wrap = false,
    } = options;

    direction = direction.toLowerCase() as Direction;

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
}
