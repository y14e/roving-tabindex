/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 1.0.0
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/roving-tabindex}
 */

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import { getFocusables } from 'power-focusable';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RovingTabIndexOptions {
  readonly direction?: 'horizontal' | 'vertical';
  readonly selector?: string;
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

  const roving = new RovingTabIndex(container, options);
  return () => roving.destroy();
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

class RovingTabIndex {
  #container!: Element;
  #options: RovingTabIndexOptions;
  #focusables = new Set<Element>();
  #tabIndexes = new Map<Element, string | null>();
  #selectorFilter: (_: Element) => boolean;
  #controller: AbortController | null = null;
  #isDestroyed = false;

  constructor(container: Element, options: RovingTabIndexOptions = {}) {
    this.#container = container;
    this.#options = options;
    const { direction, selector, wrap = false } = this.#options;

    if (direction && !['horizontal', 'vertical'].includes(direction)) {
      console.warn('Invalid direction. Fallback: both (undefined).');
      Object.assign(this.#options, { direction: undefined });
    }

    if (typeof selector !== 'string') {
      console.warn('Invalid selector. Fallback: all focusable elements.');
      Object.assign(this.#options, { selector: undefined });
    }

    if (typeof wrap !== 'boolean') {
      console.warn('Invalid wrap. Fallback: false.');
      Object.assign(this.#options, { wrap: false });
    }

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

    this.#focusables.forEach((focusable) => {
      const index = this.#tabIndexes.get(focusable);

      if (index == null) {
        focusable.removeAttribute('tabindex');
      } else {
        focusable.setAttribute('tabindex', index);
      }
    });

    this.#focusables.clear();
    this.#tabIndexes.clear();
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

    const { direction } = this.#options;
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
      return;
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
    const { wrap = false } = this.#options;

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
    }

    const focusable = focusables.at(newIndex);

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
    this.#focusables.forEach((focusable) => {
      if (current.has(focusable)) {
        return;
      }

      if (focusable.isConnected) {
        const index = this.#tabIndexes.get(focusable);

        if (index == null) {
          focusable.removeAttribute('tabindex');
        } else {
          focusable.setAttribute('tabindex', index);
        }
      }

      this.#focusables.delete(focusable);
      this.#tabIndexes.delete(focusable);
    });

    // Added
    current.forEach((c) => {
      if (this.#focusables.has(c)) {
        return;
      }

      this.#focusables.add(c);
      this.#tabIndexes.set(c, c.getAttribute('tabindex'));
      c.setAttribute('tabindex', '-1');
    });

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
    return (element) => !selector || element.matches(selector);
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
