export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Phaser's unrotated camera zooms about the middle of its physical viewport. */
export function sceneView(camera: {
  width: number;
  height: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
}): SceneRect {
  const width = camera.width / camera.zoom,
    height = camera.height / camera.zoom;
  return {
    x: camera.scrollX + camera.width / 2 - width / 2,
    y: camera.scrollY + camera.height / 2 - height / 2,
    width,
    height,
  };
}
export function sceneBoundsVisible(
  bounds: SceneRect,
  view: SceneRect,
  margin = 96,
) {
  return (
    bounds.x + bounds.width >= view.x - margin &&
    bounds.x <= view.x + view.width + margin &&
    bounds.y + bounds.height >= view.y - margin &&
    bounds.y <= view.y + view.height + margin
  );
}
