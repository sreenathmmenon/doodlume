export { artworkRasterSize } from "../../shared/artwork-validation";


/** Fraction of a texture below its lowest visible pixel. A source silhouette
 * keeps its full texture; only its visual anchor changes. Empty/unreadable
 * artwork retains the existing anchor rather than inventing a foot point. */
export function artworkFootPadding(pixels: ArrayLike<number>, width: number, height: number): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length < width * height * 4) return 0;
  for (let y = height - 1; y >= 0; y--)
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] > 0) return (height - 1 - y) / height;
  return 0;
}

/** Top-down art stays centered as authored; only platform actors stand on a
 * collision baseline. Scale the cached padding with the complete visual. */
export function artworkFootOffset(padding: number, displayHeight: number, movement: "platform" | "roam" | "discover" = "platform"): number {
  return movement === "platform" && Number.isFinite(padding) && Number.isFinite(displayHeight)
    ? Math.max(0, Math.min(1, padding)) * Math.max(0, displayHeight) : 0;
}


/** Carry beside the actual rendered subject, near its lower middle. Keep the
 * held artwork outside that subject's full visual bounds in either direction;
 * the caller retains its aspect and source pixels. */
export function carriedArtworkPosition(hero: {x:number;y:number;width:number;height:number}, held: {width:number;height:number}, facingLeft: boolean, unit = 1) {
  const gap = Math.max(2 * unit, Math.min(8 * unit, hero.width * .06));
  return {
    x: facingLeft ? hero.x - held.width / 2 - gap : hero.x + hero.width + held.width / 2 + gap,
    y: hero.y + hero.height * .62,
  };
}


/** Fit equipment against the lower outside edge of the rendered actor. A small
 * shared edge reads as mounted while leaving the face and torso recognizable.
 * Keep proportions and align its bottom to the actor's physical baseline. */
export function attachedPlayerArtwork(hero: {x:number;y:number;width:number;height:number}, source: {width:number;height:number}, baseline: number, facingLeft: boolean) {
  const scale = Math.min(1, hero.width * .65 / Math.max(1,source.width), hero.height * .35 / Math.max(1,source.height));
  const width=source.width*scale,height=source.height*scale;
  const overlap=Math.min(hero.width,width)*.08;
  return {width,height,
    x:facingLeft?hero.x-width/2+overlap:hero.x+hero.width+width/2-overlap,
    y:Math.min(baseline,hero.y+hero.height)-height/2};
}
