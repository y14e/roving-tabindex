/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 *
 * @version 0.0.1
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/roving-focus}
 */
// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------
import { getFocusables } from 'https://esm.sh/power-focusable';
// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------
export function createRovingTabIndex(container, options = {}) {
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
  #container;
  #options;
  #focusables = new Set();
  #tabIndexes = new Map();
  #controller = null;
  #isDestroyed = false;
  constructor(container, options = {}) {
    this.#container = container;
    this.#options = options;
    this.#initialize();
  }
  destroy() {
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
    this.#container.removeAttribute('data-roving-focus-initialized');
  }
  #initialize() {
    this.#update(document.activeElement);
    this.#controller = new AbortController();
    document.addEventListener('keydown', this.#onKeyDown, {
      capture: true,
      signal: this.#controller.signal,
    });
    this.#container.setAttribute('data-roving-focus-initialized', '');
  }
  #onKeyDown = (event) => {
    if (!event.composedPath().includes(this.#container)) {
      return;
    }
    const { key, altKey, ctrlKey, metaKey } = event;
    if (altKey || ctrlKey || metaKey) {
      return;
    }
    const { direction } = this.#options;
    const isBoth = direction === undefined;
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
    event.preventDefault();
    event.stopPropagation();
    const active = getActiveElement();
    if (!(active instanceof HTMLElement)) {
      return;
    }
    const { wrap = true } = this.#options;
    const focusables = this.#getFocusables();
    const currentIndex = focusables.indexOf(active);
    let newIndex = currentIndex;
    let at;
    switch (key) {
      case 'End':
        newIndex = -1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        at = currentIndex - 1;
        newIndex = wrap ? at : Math.max(at, 0);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        at = currentIndex + 1;
        newIndex = wrap
          ? at % focusables.length
          : Math.min(at, focusables.length - 1);
        break;
    }
    const focusable = focusables.at(newIndex);
    if (!focusable) {
      return;
    }
    this.#update(focusable);
    focusElement(focusable);
  };
  #update(active) {
    const current = new Set([
      ...getFocusables(this.#container, { composed: true }),
      ...this.#getFocusables(),
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
  #getFocusables() {
    return getFocusables(this.#container, {
      composed: true,
      include: (element) => {
        return this.#focusables.has(element);
      },
    });
  }
}
// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------
function focusElement(element) {
  'focus' in element && typeof element.focus === 'function' && element.focus();
}
function getActiveElement() {
  let current = document.activeElement;
  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }
  return current;
}
