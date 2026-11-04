import { retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "../../shared/world";

export interface StudioEntry { token: string; world: WorldDefinition; state: PlayState }

/** A deliberate personal copy of a played example, including the visitor's
 * artwork and earned progress. No storage or existing studio draft is touched. */
export function entryFromExample(world: WorldDefinition, progress: PlayState): StudioEntry {
  const next = validateWorld({...structuredClone(world), id:crypto.randomUUID(), source:"manual",
    name:`${world.name.slice(0,67)} · my version`});
  const state=structuredClone(progress);
  if(state.retryCheckpoint)state.retryCheckpoint.worldId=next.id;
  return {token:crypto.randomUUID(),world:next,state:retainPlayState(next,state)};
}
