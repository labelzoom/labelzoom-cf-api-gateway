import { Hono } from "hono";
import { cors } from 'hono/cors';
import mysql from 'mysql2/promise';

async function getConnection(env: Env): Promise<mysql.Connection> {
    return mysql.createConnection({
        host: env.DB.host,
        user: env.DB.user,
        password: env.DB.password,
        database: env.DB.database,
        port: env.DB.port,
        // The following line is needed for mysql2 compatibility with Workers
        // mysql2 uses eval() to optimize result parsing for rows with > 100 columns
        // Configure mysql2 to use static parsing instead of eval() parsing with disableEval
        disableEval: true,
    });
}

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

app.get("/api/v2/heartbeat/db", async (c) => {
    const conn = await getConnection(c.env);
    const [rows] = await conn.query('SHOW TABLES;');
    await conn.end();
    return c.json(rows);
});

export default app;
