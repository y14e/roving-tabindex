// node_modules/power-focusable/dist/index.js
var FOCUSABLE_SELECTOR = `:is(a[href], area[href], button, embed, iframe, input:not([type="hidden" i]), object, select, details > summary:first-of-type, textarea, [contenteditable]:not([contenteditable="false" i]), [controls], [tabindex]):not(:disabled, [hidden], [inert], [tabindex="-1"])`;
function getFocusables(container = document.body, options = {}) {
  if (!(container instanceof Element)) {
    console.warn("Invalid container element. Fallback: <body> element.");
    container = document.body;
  }
  const { composed = false } = options;
  let { filter, include } = options;
  if (filter && typeof filter !== "function") {
    console.warn("Invalid filter function");
    filter = void 0;
  }
  if (include && typeof include !== "function") {
    console.warn("Invalid include function");
    include = void 0;
  }
  const elements = [];
  if (composed || include) {
    let traverse2 = function(node) {
      if (node instanceof Element) {
        if (isFocusable(node) || include?.(node)) {
          elements[elements.length] = node;
        }
      }
      const children = getComposedChildren(node);
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        if (!child) {
          continue;
        }
        traverse2(child);
      }
    };
    traverse2(container);
  } else {
    const candidates = container.querySelectorAll(FOCUSABLE_SELECTOR);
    for (let i = 0, l = candidates.length; i < l; i++) {
      const candidate = candidates[i];
      if (!(candidate instanceof Element)) {
        continue;
      }
      if (isFocusable(candidate)) {
        elements[elements.length] = candidate;
      }
    }
  }
  const unfiltered = normalizeRadioGroup(sortByTabIndex(elements));
  return filter ? unfiltered.filter(filter) : unfiltered;
}
function isFocusable(element) {
  if (!(element instanceof Element)) {
    console.warn("Invalid element");
    return false;
  }
  if (element.hasAttribute("hidden") || isInert(element)) {
    return false;
  }
  if (getTabIndex(element) < 0) {
    return false;
  }
  if (!element.matches(FOCUSABLE_SELECTOR)) {
    return false;
  }
  if (isDisabledDeep(element)) {
    return false;
  }
  if (!element.checkVisibility({
    contentVisibilityAuto: true,
    opacityProperty: true,
    visibilityProperty: true
  })) {
    return false;
  }
  return true;
}
function isDisabledDeep(element) {
  let current = element;
  while (current) {
    if (current instanceof ShadowRoot) {
      if (current.mode !== "open") {
        return false;
      }
      current = current.host;
      continue;
    }
    if (!(current instanceof Element)) {
      current = current.parentNode;
      continue;
    }
    if (current === element && isFormControl(current) && isDisabled(current)) {
      return true;
    }
    if (isInert(current)) {
      return true;
    }
    if (isFormControl(element) && current.tagName === "FIELDSET" && isDisabled(current)) {
      if (!current.querySelector(":scope > legend:first-of-type")?.contains(element)) {
        return true;
      }
    }
    current = current.parentNode;
  }
  return false;
}
function normalizeRadioGroup(elements) {
  let map = null;
  for (let i = 0, l = elements.length; i < l; i++) {
    const element = elements[i];
    if (!(element instanceof HTMLInputElement)) {
      continue;
    }
    if (!isUngroupedRadio(element)) {
      continue;
    }
    if (!map) {
      map = /* @__PURE__ */ new Map();
    }
    const key = `${element.form?.id ?? "no-form"}::${element.name}`;
    const group = map.get(key) ?? map.set(key, []).get(key);
    if (group) {
      group[group.length] = element;
    }
  }
  if (!map) {
    return elements;
  }
  const placeholder = /* @__PURE__ */ new Set();
  for (const group of map.values()) {
    placeholder.add(group.find((radio) => radio.checked) ?? group[0]);
  }
  return elements.filter((element) => {
    if (isUngroupedRadio(element)) {
      return placeholder.has(element);
    }
    return true;
  });
}
function sortByTabIndex(elements) {
  const ordered = [];
  const natural = [];
  for (let i = 0, l = elements.length; i < l; i++) {
    const element = elements[i];
    if (!element) {
      continue;
    }
    const target = getTabIndex(element) > 0 ? ordered : natural;
    target[target.length] = element;
  }
  ordered.sort((a, b) => getTabIndex(a) - getTabIndex(b));
  let count = 0;
  const sorted = new Array(ordered.length + natural.length);
  for (let i = 0, l = ordered.length; i < l; i++) {
    sorted[count++] = ordered[i];
  }
  for (let i = 0, l = natural.length; i < l; i++) {
    sorted[count++] = natural[i];
  }
  return sorted;
}
function getComposedChildren(node) {
  if (node instanceof ShadowRoot) {
    return getChildren(node);
  }
  if (!(node instanceof Element)) {
    return [];
  }
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedElements({ flatten: true });
    if (assigned.length) {
      return assigned;
    }
  }
  if (node instanceof HTMLElement && node.shadowRoot?.mode === "open") {
    return getChildren(node.shadowRoot);
  }
  return getChildren(node);
}
function getChildren(node) {
  const elements = [];
  for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
    elements[elements.length] = child;
  }
  return elements;
}
function getTabIndex(element) {
  return "tabIndex" in element ? Number(element.tabIndex) : 0;
}
function isDisabled(element) {
  return "disabled" in element && !!element.disabled;
}
function isFormControl(element) {
  const name = element.tagName;
  return name === "BUTTON" || name === "INPUT" || name === "SELECT" || name === "TEXTAREA";
}
function isInert(element) {
  return "inert" in element && !!element.inert;
}
function isUngroupedRadio(element) {
  return element instanceof HTMLInputElement && element.type === "radio" && !!element.name;
}

// src/index.ts
function createRovingTabIndex(container, options = {}) {
  if (!(container instanceof Element)) {
    throw new Error("Invalid container element");
  }
  const { direction, selector, wrap = false } = options;
  if (direction && !["horizontal", "vertical"].includes(direction)) {
    console.warn("Invalid direction. Fallback: both (undefined).");
    Object.assign(options, { direction: void 0 });
  }
  if (typeof selector !== "string") {
    console.warn("Invalid selector. Fallback: all focusable elements.");
    Object.assign(options, { selector: void 0 });
  }
  if (typeof wrap !== "boolean") {
    console.warn("Invalid wrap. Fallback: false.");
    Object.assign(options, { wrap: false });
  }
  const roving = new RovingTabIndex(container, options);
  return () => roving.destroy();
}
var RovingTabIndex = class {
  #container;
  #options;
  #focusables = /* @__PURE__ */ new Set();
  #tabIndexes = /* @__PURE__ */ new Map();
  #selectorFilter;
  #controller = null;
  #isDestroyed = false;
  constructor(container, options = {}) {
    this.#container = container;
    this.#options = options;
    this.#selectorFilter = this.#createSelectorFilter();
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
        focusable.removeAttribute("tabindex");
      } else {
        focusable.setAttribute("tabindex", index);
      }
    });
    this.#focusables.clear();
    this.#tabIndexes.clear();
    this.#container.removeAttribute("data-roving-tabindex-initialized");
  }
  #initialize() {
    this.#update(document.activeElement);
    this.#controller = new AbortController();
    document.addEventListener("keydown", this.#onKeyDown, {
      capture: true,
      signal: this.#controller.signal
    });
    this.#container.setAttribute("data-roving-tabindex-initialized", "");
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
    const isBoth = !direction;
    const isHorizontal = direction === "horizontal";
    if (![
      "End",
      "Home",
      ...isBoth ? ["ArrowLeft", "ArrowUp"] : [`Arrow${isHorizontal ? "Left" : "Up"}`],
      ...isBoth ? ["ArrowRight", "ArrowDown"] : [`Arrow${isHorizontal ? "Right" : "Down"}`]
    ].includes(key)) {
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
    let rawIndex;
    let newIndex = currentIndex;
    const { wrap = false } = this.#options;
    switch (key) {
      case "End":
        newIndex = -1;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        rawIndex = currentIndex - 1;
        newIndex = wrap ? rawIndex : Math.max(rawIndex, 0);
        break;
      case "ArrowRight":
      case "ArrowDown":
        rawIndex = currentIndex + 1;
        newIndex = wrap ? rawIndex % focusables.length : Math.min(rawIndex, focusables.length - 1);
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
    const current = /* @__PURE__ */ new Set([
      ...this.#getFocusables(),
      ...getFocusables(this.#container, {
        composed: true,
        filter: this.#selectorFilter
      })
    ]);
    this.#focusables.forEach((focusable) => {
      if (current.has(focusable)) {
        return;
      }
      if (focusable.isConnected) {
        const index = this.#tabIndexes.get(focusable);
        if (index == null) {
          focusable.removeAttribute("tabindex");
        } else {
          focusable.setAttribute("tabindex", index);
        }
      }
      this.#focusables.delete(focusable);
      this.#tabIndexes.delete(focusable);
    });
    current.forEach((c) => {
      if (this.#focusables.has(c)) {
        return;
      }
      this.#focusables.add(c);
      this.#tabIndexes.set(c, c.getAttribute("tabindex"));
      c.setAttribute("tabindex", "-1");
    });
    if (active && this.#focusables.has(active)) {
      this.#focusables.forEach((focusable) => {
        focusable.setAttribute("tabindex", focusable === active ? "0" : "-1");
      });
      return;
    }
    [...this.#focusables].forEach((focusable, i) => {
      focusable.setAttribute("tabindex", i ? "-1" : "0");
    });
  }
  #createSelectorFilter() {
    const { selector } = this.#options;
    return (element) => !selector || [...this.#container.querySelectorAll(selector)].includes(element);
  }
  #getFocusables() {
    return getFocusables(this.#container, {
      composed: true,
      filter: this.#selectorFilter,
      include: (element) => this.#focusables.has(element)
    });
  }
};
function focusElement(element) {
  "focus" in element && typeof element.focus === "function" && element.focus();
}
function getActiveElement() {
  let current = document.activeElement;
  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }
  return current;
}
/**
 * Roving Tabindex
 * Lightweight roving tabindex utility with fully focus management.
 * Designed for accessible menus, tabs, toolbars, and composite widgets.
 *
 * @version 1.0.1
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/roving-tabindex}
 */
/*! Bundled license information:

power-focusable/dist/index.js:
  (**
   * Power Focusable
   * High-precision focus management utility with full composed tree support.
   * Handles complex focus rules including tabindex ordering, radio groups, inert.
   *
   * @version 4.1.5
   * @author Yusuke Kamiyamane
   * @license MIT
   * @copyright Copyright (c) Yusuke Kamiyamane
   * @see {@link https://github.com/y14e/power-focusable}
   *)
*/

export { createRovingTabIndex };
