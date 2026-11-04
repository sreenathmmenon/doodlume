/** Operational failure locations only. Never log model messages, source images,
 * request bodies, URLs, filesystem paths, headers, or provider credentials. */
export function failureLocation(error:unknown) {
  const type=error instanceof Error && ['Error','TypeError','RangeError','SyntaxError'].includes(error.name) ? error.name : 'UnknownError';
  const frames=error instanceof Error ? (error.stack ?? '').split('\n').slice(1).flatMap(line=>{
    const match=line.match(/^\s+at .*\/(server|shared)\/([a-zA-Z0-9_-]{1,60}\.ts):(\d+):(\d+)\)?$/);
    return match ? [`${match[1]}/${match[2]}:${match[3]}:${match[4]}`] : [];
  }).slice(0,4):[];
  return {type,frames};
}
