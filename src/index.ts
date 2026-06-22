/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 3.0.7
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
import { getFocusables } from 'power-focusable';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RovingTabIndexOptions {
  readonly direction?: 'horizontal' | 'vertical';
  readonly navigationOnly?: boolean;
  readonly noMemory?: boolean;
  readonly noStart?: boolean;
  readonly selector?: string;
  readonly typeahead?: boolean;
  readonly wrap?: boolean;
}

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------

export function createRovingTabIndex(
  container: Element,
  options: RovingTabIndexOptions = {},
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
  #container: Element;
  #settings: RovingTabIndexOptions;
  #focusables = new Set<Element>();
  #focusablesByFirstChar = new Map<string, Element[]>();
  #selectorFilter: (_: Element) => boolean;
  #controller: AbortController | null = null;
  #isDestroyed = false;

  constructor(container: Element, options: RovingTabIndexOptions = {}) {
    this.#container = container;
    let {
      direction,
      navigationOnly = false,
      noMemory = false,
      noStart = false,
      selector,
      typeahead = false,
      wrap = false,
    } = options;

    if (
      typeof direction !== 'undefined' &&
      !['horizontal', 'vertical'].includes(direction)
    ) {
      console.warn('Invalid direction option. Fallback: both (undefined).');
      direction = undefined;
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

    if (
      typeof selector !== 'undefined' &&
      (typeof selector !== 'string' || !selector.trim())
    ) {
      console.warn(
        'Invalid selector. Fallback: all focusable elements (undefined).',
      );
      selector = undefined;
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
      navigationOnly,
      noMemory,
      noStart,
      typeahead,
      wrap,
    };
    direction && Object.assign(this.#settings, { direction });
    selector && Object.assign(this.#settings, { selector });
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
    this.#container.removeAttribute('data-roving-tabindex-initialized');
  }

  #initialize(): void {
    this.#update(document.activeElement);
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    document.addEventListener('focusin', this.#onFocusIn, {
      capture: true,
      signal,
    });
    document.addEventListener('keydown', this.#onKeyDown, {
      capture: true,
      signal,
    });
    this.#container.setAttribute('data-roving-tabindex-initialized', '');
  }

  #onFocusIn = (event: FocusEvent): void => {
    const { target } = event;

    if (!(target instanceof Element)) {
      return;
    }

    const isFocusable = this.#focusables.has(target);
    this.#settings.noMemory && !isFocusable
      ? this.#update(null)
      : isFocusable && this.#update(target);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (!event.composedPath().includes(this.#container)) {
      return;
    }

    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;

    if (altKey || ctrlKey || metaKey || shiftKey) {
      return;
    }

    const { direction, typeahead, wrap } = this.#settings;
    const isBoth = !direction;
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

    const active = getActiveElement();

    if (!(active instanceof HTMLElement)) {
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
        newIndex = -1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp': {
        const rawIndex = currentIndex - 1;
        newIndex = wrap ? rawIndex : Math.max(rawIndex, 0);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        const rawIndex = currentIndex + 1;
        newIndex = wrap
          ? rawIndex % current.length
          : Math.min(rawIndex, current.length - 1);
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

  #update(active: Element | null): void {
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

      this.#focusables.add(focusable);

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
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function focusElement(element: Element): void {
  'focus' in element && typeof element.focus === 'function' && element.focus();
}

function getActiveElement(): Element | null {
  let current = document.activeElement;

  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }

  return current;
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export {
  addTokenToAttribute,
  getFocusables,
  restoreAttributes,
  saveAttributes,
};
