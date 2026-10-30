import { getActiveElement } from 'power-focusable';

function getCellCoords(cell: Element): { x: number; y: number } {
  const { left, top, width, height } = cell.getBoundingClientRect();
  return { x: left + width / 2, y: top + height / 2 };
}

export function getCellsOfActiveRow(cells: Element[]): Element[] {
  const active = getActiveElement();

  if (!(active instanceof Element)) {
    return [];
  }

  const activeRect = active.getBoundingClientRect();
  return cells.filter((cell) => {
    const cellRect = cell.getBoundingClientRect();
    return cellRect.top < activeRect.bottom && cellRect.bottom > activeRect.top;
  });
}

export function getNextCell(cells: Element[], key: string, wrap: boolean): Element | null {
  const active = getActiveElement();

  if (!(active instanceof Element)) {
    return null;
  }

  const activeCoords = getCellCoords(active);
  let min = Infinity;
  let result: Element | null = null;

  for (const cell of cells) {
    if (cell === active) {
      continue;
    }

    const cellCoords = getCellCoords(cell);
    const distances = {
      x: Math.abs(cellCoords.x - activeCoords.x),
      y: Math.abs(cellCoords.y - activeCoords.y),
    };

    if (
      (key === 'ArrowUp' && cellCoords.y < activeCoords.y && distances.x < distances.y) ||
      (key === 'ArrowDown' && cellCoords.y > activeCoords.y && distances.x < distances.y)
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

      const cellCoords = getCellCoords(cell);

      if (Math.abs(cellCoords.x - activeCoords.x) < cell.getBoundingClientRect().width / 2) {
        const distance =
          key === 'ArrowUp' ? cellCoords.y - activeCoords.y : activeCoords.y - cellCoords.y;

        if (distance > max) {
          max = distance;
          result = cell;
        }
      }
    }
  }

  return result;
}
