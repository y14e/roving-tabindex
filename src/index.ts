/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 1.2.2
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
  readonly direction?: 'horizontal' | 'vertical' | undefined;
  readonly selector?: string | undefined;
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
    throw new Error('Invalid container element');
  }

  let { direction, selector, typeahead = false, wrap = false } = options;

  if (
    typeof direction !== 'undefined' &&
    !['horizontal', 'vertical'].includes(direction)
  ) {
    console.warn('Invalid direction. Fallback: both (undefined).');
    direction = undefined;
  }

  if (typeof selector !== 'undefined' && typeof selector !== 'string') {
    console.warn(
      'Invalid selector. Fallback: all focusable elements (undefined).',
    );
    selector = undefined;
  }

  if (typeof typeahead !== 'boolean') {
    console.warn('Invalid typeahead. Fallback: false.');
    typeahead = false;
  }

  if (typeof wrap !== 'boolean') {
    console.warn('Invalid wrap. Fallback: false.');
    wrap = false;
  }

  const roving = new RovingTabIndex(container, {
    direction,
    selector,
    typeahead,
    wrap,
  });
  return () => roving.destroy();
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

class RovingTabIndex {
  #container!: Element;
  #options: RovingTabIndexOptions;
  #focusables = new Set<Element>();
  #focusablesByFirstChar = new Map<string, Element[]>();
  #selectorFilter: (_: Element) => boolean;
  #controller: AbortController | null = null;
  #isDestroyed = false;

  constructor(container: Element, options: RovingTabIndexOptions = {}) {
    this.#container = container;
    this.#options = options;
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
    document.addEventListener('keydown', this.#onKeyDown, {
      capture: true,
      signal: this.#controller.signal,
    });
    this.#container.setAttribute('data-roving-tabindex-initialized', '');
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (!event.composedPath().includes(this.#container)) {
      return;
    }

    const { key, altKey, ctrlKey, metaKey } = event;

    if (altKey || ctrlKey || metaKey) {
      return;
    }

    const { direction, typeahead, wrap } = this.#options;
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

    const focusables = this.#getFocusables();

    if (!focusables.includes(active)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = focusables.indexOf(active);
    let rawIndex: number;
    let newIndex = currentIndex;
    let target = focusables;

    switch (key) {
      case 'End':
        newIndex = -1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        rawIndex = currentIndex - 1;
        newIndex = wrap ? rawIndex : Math.max(rawIndex, 0);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        rawIndex = currentIndex + 1;
        newIndex = wrap
          ? rawIndex % focusables.length
          : Math.min(rawIndex, focusables.length - 1);
        break;
      default: {
        if (!typeahead) {
          break;
        }

        target = this.#focusablesByFirstChar.get(key.toUpperCase()) ?? [];
        const foundIndex = target.findIndex(
          (focusable) => focusables.indexOf(focusable) > currentIndex,
        );
        newIndex = foundIndex !== -1 ? foundIndex : 0;
      }
    }

    const focusable = target.at(newIndex);

    if (!focusable) {
      return;
    }

    this.#update(focusable);
    focusElement(focusable);
  };

  #update(active: Element | null): void {
    const current = new Set<Element>([
      ...this.#getFocusables(),
      ...getFocusables(this.#container, {
        composed: true,
        filter: this.#selectorFilter,
      }),
    ]);

    // Removed
    for (const focusable of this.#focusables) {
      if (current.has(focusable)) {
        continue;
      }

      if (focusable.isConnected) {
        restoreAttributes([focusable]);
      }

      this.#focusables.delete(focusable);
      this.#focusablesByFirstChar.forEach((focusables) => {
        const index = focusables.indexOf(focusable);

        if (index !== -1) {
          focusables.splice(index, 1);
        }
      });
    }

    // Added
    for (const c of current) {
      if (this.#focusables.has(c)) {
        continue;
      }

      this.#focusables.add(c);
      saveAttributes([c], ['tabindex']);
      c.setAttribute('tabindex', '-1');

      if (!this.#options.typeahead) {
        continue;
      }

      // Typeahead
      const shortcuts = c.ariaKeyShortcuts?.trim() ?? '';
      const keys = new Set(
        shortcuts
          ? shortcuts
              .split(/\s+/)
              .filter((key) => /^\S$/i.test(key))
              .map((key) => key.toUpperCase())
          : [],
      );
      const char = c.textContent?.trim()?.at(0)?.toUpperCase();

      if (char) {
        keys.add(char);
        saveAttributes([c], ['aria-keyshortcuts']);
        addTokenToAttribute(c, 'aria-keyshortcuts', char, {
          caseInsensitive: true,
        });
      }

      keys.forEach((key) => {
        const focusables = this.#focusablesByFirstChar.get(key) ?? [];
        focusables.push(c);
        this.#focusablesByFirstChar.set(key, focusables);
      });
    }

    if (active && this.#focusables.has(active)) {
      this.#focusables.forEach((focusable) => {
        focusable.setAttribute('tabindex', focusable === active ? '0' : '-1');
      });

      return;
    }

    [...this.#focusables].forEach((focusable, i) => {
      focusable.setAttribute('tabindex', i ? '-1' : '0');
    });
  }

  #createSelectorFilter(): (element: Element) => boolean {
    const { selector } = this.#options;
    return (element) =>
      !selector ||
      [...this.#container.querySelectorAll(selector)].includes(element);
  }

  #getFocusables(): Element[] {
    return getFocusables(this.#container, {
      composed: true,
      filter: this.#selectorFilter,
      include: (element) => this.#focusables.has(element),
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
