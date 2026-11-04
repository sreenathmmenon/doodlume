import type { FastifyInstance } from 'fastify';

export function hostingConfig(env: Record<string,string|undefined>) {
  const port=Number(env.PORT || env.API_PORT || 8787);
  if(!Number.isInteger(port)||port<1||port>65534)throw new Error('PORT must be between 1 and 65534.');
  const configured=env.PUBLIC_ORIGIN?.trim() || (env.RAILWAY_PUBLIC_DOMAIN?.trim() ? `https://${env.RAILWAY_PUBLIC_DOMAIN.trim()}` : '');
  let publicOrigin:string|undefined;
  if(configured){
    const url=new URL(configured);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.includes('.'))
      throw new Error('PUBLIC_ORIGIN must be one HTTPS origin without a path or credentials.');
    publicOrigin=url.origin;
  }
  if(env.NODE_ENV==='production'&&!publicOrigin)throw new Error('Set PUBLIC_ORIGIN or provision a Railway public domain before starting the hosted studio.');
  return {port, publicOrigin, host:publicOrigin?'0.0.0.0':'127.0.0.1',
    hosts:new Set(publicOrigin?[new URL(publicOrigin).host]:[`127.0.0.1:${port}`,`localhost:${port}`]),
    origins:new Set(publicOrigin?[publicOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173'])};
}

export function installHostingBoundary(app:FastifyInstance, config:ReturnType<typeof hostingConfig>) {
  app.addHook('onRequest',async(request,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Frame-Options','DENY');
    if(config.publicOrigin)reply.header('Strict-Transport-Security','max-age=31536000');
    if(request.url.startsWith('/api/')||request.url.startsWith('/capture/'))reply.header('Cache-Control','no-store');
    // Platform probes have an internal Host. This exception exposes only these
    // two fixed read-only endpoints, never APIs, captures, or the application.
    if(['GET','HEAD'].includes(request.method)&&['/healthz','/readyz'].includes(request.url.split('?',1)[0]))return;
    if(!request.headers.host||!config.hosts.has(request.headers.host.toLowerCase()))
      return reply.code(403).send({error:'Open the studio at its configured address.'});
    if(request.headers.origin&&!config.origins.has(request.headers.origin))
      return reply.code(403).send({error:'This action must come from this studio.'});
  });
}
