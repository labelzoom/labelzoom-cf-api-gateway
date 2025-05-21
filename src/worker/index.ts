import { Hono, HonoRequest } from "hono";
import { cors } from 'hono/cors';
import { HTTPException } from "hono/http-exception";
import { decode } from 'hono/jwt'
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

/**
 * Validates the `Authorization` header on the request. If anything is wrong with the header (wrong format, invalid JWT token, invalid license or secret),
 * then an `HTTPException` will be thrown.
 * @throws {HTTPException}
 */
async function validateLicense(env: Env, req: HonoRequest) {
    // Verify header
    const authHeader = req.header('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) throw new HTTPException(401, { message: "Invalid Authorization header" });

    // Verify token
    const token = authHeader.substring('Bearer '.length);
    const { payload } = decode(token); // TODO: Add verification
    if (!payload) throw new HTTPException(401, { message: "Invalid bearer token" });

    // Verify license
    const licenseId = payload.lic;
    const licenseKey = payload.secret;
    const db = await getConnection(env);
    const [results] = await (db as any).query("SELECT * FROM licenses WHERE id = ? AND license_secret = ?;", [licenseId, licenseKey]);
    if (results.length !== 1) throw new HTTPException(401, { message: "Invalid license" });
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

app.get("/api/v2/convert/url/to/zpl/:url{.+}", async (c) => {
    const url = new URL(c.req.param('url') ?? '');
    await validateLicense(c.env, c.req);
    return fetch(url);
});

export default app;
