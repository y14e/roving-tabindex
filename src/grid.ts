import { getActiveElement } from 'power-focusable';

function getCellRect(cell: Element): { w: number; x: number; y: number } {
  const { x, y, width: w, height: h } = cell.getBoundingClientRect();
  return { w, x: x + w / 2, y: y + h / 2 };
}

export function getNextCell(cells: Element[], key: string, wrap: boolean): Element | null {
  const active = getActiveElement();

  if (!(active instanceof Element)) {
    return null;
  }

  const { x: ax, y: ay } = getCellRect(active);
  let min = Infinity;
  let result: Element | null = null;

  for (const cell of cells) {
    if (cell === active) {
      continue;
    }

    const { x: cx, y: cy } = getCellRect(cell);
    const [dx, dy] = [Math.abs(cx - ax), Math.abs(cy - ay)];

    if ((key === 'ArrowUp' && cy < ay && dx < dy) || (key === 'ArrowDown' && cy > ay && dx < dy)) {
      const distance = dx ** 2 + dy ** 2;

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

      const { x: cx, y: cy, w: cw } = getCellRect(cell);

      if (Math.abs(cx - ax) < cw / 2) {
        const distance = key === 'ArrowUp' ? cy - ay : ay - cy;

        if (distance > max) {
          max = distance;
          result = cell;
        }
      }
    }
  }

  return result;
}

export function getSameRowCells(cells: Element[], anchor: Element): Element[] {
  const { y: ay, bottom: ab } = anchor.getBoundingClientRect();

  return cells.filter((cell) => {
    const { y: cy, bottom: cb } = cell.getBoundingClientRect();
    return cy < ab && cb > ay;
  });
}
