export default {fetch(request:Request,env:Cloudflare.Env){return env.ASSETS.fetch(request)}} satisfies ExportedHandler<Cloudflare.Env>;
