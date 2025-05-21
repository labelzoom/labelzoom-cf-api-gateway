import { Hono } from "hono";
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
    const corsMiddleware = cors({
        origin: c.env.LZ_ALLOWED_ORIGINS,
        allowHeaders: [],
        allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

        /* CORS-safelisted response headers:
        * - Cache-Control
        * - Content-Language
        * - Content-Length
        * - Content-Type
        * - Expires
        * - Last-Modified
        * - Pragma
        */
        exposeHeaders: ['Retry-After', 'X-LZ-Request-ID'],

        maxAge: 86400,
        credentials: true,
    });
    return corsMiddleware(c, next);
});

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

export default app;
