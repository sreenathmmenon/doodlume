import type {WorldEntity} from '../../shared/world';

/** Drop only through the thin ledges currently under the feet. Lower ledges
 * remain solid so the player can descend one level at a time. */
export function supportingDropPlatforms(entities: WorldEntity[], body: {left:number;right:number;bottom:number}): string[] {
  return entities.filter(e => (e.kind==='terrain'||e.kind==='bridge') && e.height<=40 &&
    Math.abs(e.y-body.bottom)<=12 && e.x<body.right && e.x+e.width>body.left).map(e=>e.id);
}
