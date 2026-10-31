export type EditorSize = { width: number; height: number };
export type EditorPoint = { x: number; y: number };
export type EditorView = EditorPoint & EditorSize;

export function editorFitScale(world: EditorSize, viewport: EditorSize) {
  return Math.min(viewport.width / world.width, viewport.height / world.height);
}

/** Center small worlds; keep a detailed view within the world's edges. */
export function editorView(
  world: EditorSize,
  viewport: EditorSize,
  scale: number,
  center: EditorPoint,
): EditorView {
  const width = viewport.width / scale;
  const height = viewport.height / scale;
  const axis = (size: number, extent: number, target: number) =>
    extent >= size
      ? (size - extent) / 2
      : Math.max(0, Math.min(size - extent, target - extent / 2));
  return {
    x: axis(world.width, width, center.x),
    y: axis(world.height, height, center.y),
    width,
    height,
  };
}

export function editorPoint(
  view: EditorView,
  viewport: EditorSize,
  offset: EditorPoint,
): EditorPoint {
  return {
    x: view.x + (offset.x * view.width) / viewport.width,
    y: view.y + (offset.y * view.height) / viewport.height,
  };
}

export function editorCenter(view: EditorView): EditorPoint {
  return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
}
