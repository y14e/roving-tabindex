/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 3.1.30
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/roving-tabindex}
 */

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import * as utils from '@y14e/attribute-utils';
import * as pf from 'power-focusable';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RovingTabIndexOptions {
  direction: Direction;
  navigationOnly: boolean;
  noMemory: boolean;
  noStart: boolean;
  selector: string;
  typeahead: boolean;
  wrap: boolean;
}

type Direction = 'both' | 'horizontal' | 'vertical';

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

  const roving = new RovingTabIndex(container, options);
  return () => roving.destroy();
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

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

    for (const f of this.#focusables) {
      RovingTabIndex.#initialized.delete(f);
      utils.restoreAttributes(f);
    }

    this.#focusables.clear();
    this.#focusablesByFirstChar.clear();
  }

  #initialize(): void {
    this.#update(pf.getActiveElement());
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

    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;

    if (altKey || ctrlKey || metaKey || shiftKey) {
      return;
    }

    const { direction, typeahead, wrap } = this.#settings;
    const isBoth = direction === 'both';
    const isHorizontal = direction === 'horizontal';

    if (
      ![
        'End',
        'Home',
        ...(isBoth
          ? ['ArrowLeft', 'ArrowUp']
          : [`Arrow${isHorizontal ? 'Left' : 'Up'}`]),
        ...(isBoth
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

    const active = pf.getActiveElement();

    if (!(active instanceof Element)) {
      return;
    }

    if (!candidates.includes(active)) {
      return;
    }

    event.preventDefault();
    let newIndex: number;
    const activeIndex = candidates.indexOf(active);
    let focusables = candidates;

    switch (key) {
      case 'End':
        newIndex = -1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp': {
        const rawIndex = activeIndex - 1;
        newIndex = wrap ? rawIndex : Math.max(rawIndex, 0);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        const rawIndex = activeIndex + 1;
        const length = focusables.length;
        newIndex = wrap ? rawIndex % length : Math.min(rawIndex, length - 1);
        break;
      }
      default: {
        // Typeahead
        const focusablesByFirstChar = new Set(
          this.#focusablesByFirstChar.get(key.toUpperCase()) ?? [],
        );
        focusables = candidates.filter((c) => focusablesByFirstChar.has(c));
        const afterIndex = focusables.findIndex(
          (f) => candidates.indexOf(f) > activeIndex,
        );
        newIndex = afterIndex >= 0 ? afterIndex : 0;
      }
    }

    const focusable = focusables.at(newIndex);
    focusable && pf.focusElement(focusable);
  };

  #update(active?: Element | null): void {
    const current = new Set(this.#getFocusables());

    // Removed
    for (const f of this.#focusables) {
      if (!current.has(f)) {
        RovingTabIndex.#initialized.delete(f);
        utils.restoreAttributes(f);
        this.#focusables.delete(f);

        for (const [k, g] of this.#focusablesByFirstChar) {
          const index = g.indexOf(f);

          if (index >= 0) {
            g.splice(index, 1);
            !g.length && this.#focusablesByFirstChar.delete(k);
          }
        }
      }
    }

    const { navigationOnly, noStart, typeahead } = this.#settings;

    // Added
    for (const f of current) {
      if (this.#focusables.has(f)) {
        continue;
      }

      if (RovingTabIndex.#initialized.has(f)) {
        continue;
      }

      this.#focusables.add(f);
      RovingTabIndex.#initialized.add(f);

      if (!navigationOnly) {
        utils.saveAttributes(f, 'tabindex');
        f.setAttribute('tabindex', '-1');
      }

      if (!typeahead) {
        continue;
      }

      // Typeahead
      const char = f.textContent?.trim()?.at(0)?.toUpperCase();
      const value = f.ariaKeyShortcuts?.trim();
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
        utils.saveAttributes(f, 'aria-keyshortcuts');
        utils.addAttributeToken(f, 'aria-keyshortcuts', char, {
          caseInsensitive: true,
        });
      }

      for (const k of keys) {
        const focusables = this.#focusablesByFirstChar.get(k) ?? [];
        focusables.push(f);
        this.#focusablesByFirstChar.set(k, focusables);
      }
    }

    if (!navigationOnly) {
      if (active && this.#focusables.has(active)) {
        for (const f of this.#focusables) {
          f.setAttribute('tabindex', f === active ? '0' : '-1');
        }
      } else {
        [...this.#focusables].forEach((f, i) => {
          f.setAttribute('tabindex', i || noStart ? '-1' : '0');
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
    return pf.getFocusables(this.#container, {
      composed: true,
      filter: this.#selectorFilter,
      skipNegativeTabIndexCheck: !this.#settings.navigationOnly,
      skipVisibilityCheck: true,
    });
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

    if (!['both', 'horizontal', 'vertical'].includes(direction)) {
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
