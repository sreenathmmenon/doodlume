interface PixelContext {
  left:number;
  top:number;
  width:number;
  height:number;
  prompt?:{left:number;top:number;width:number;height:number};
}

/** Normalized expansions can round or clamp to the same pixel context. Send
 * each exact output/prompt pair once, preserving its first occurrence and every
 * distinct prompt. Duplicate inference cannot provide independent agreement. */
export function uniqueActorContexts<T extends PixelContext>(contexts:readonly T[]):T[] {
  const seen=new Set<string>();
  return contexts.filter(context=>{
    const {left,top,width,height,prompt}=context;
    const key=JSON.stringify([left,top,width,height,prompt ? [prompt.left,prompt.top,prompt.width,prompt.height] : null]);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
