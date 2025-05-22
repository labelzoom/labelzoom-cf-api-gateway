import { Context, Hono } from "hono";
import { cors } from 'hono/cors';
import { decode } from 'hono/jwt';
import { proxy } from "hono/proxy";
import { requestId } from "hono/request-id";
import mysql from 'mysql2/promise';
import { logToR2 } from "./middleware/log-to-r2";
import { proxyToBackend } from "./handlers/proxy-to-backend";
import { forceRelativeRedirects } from "./middleware/force-relative-redirects";
import { every } from "hono/combine";
import { Connection, hyperdrive } from "./middleware/hyperdrive";
import { bearerAuth } from "hono/bearer-auth";

/**
 * Validates the `Authorization` header on the request. If anything is wrong with the header (wrong format, invalid JWT token, invalid license or secret),
 * then an `HTTPException` will be thrown.
 * @throws {HTTPException}
 */
async function validateLicense(token: string, c: Context) {
    const db: Connection | undefined = c.get('db');
    if (!db) throw new Error('license validator must be used with (and sequenced after) the hyperdrive middleware');

    try {
        const { payload } = decode(token); // TODO: Add token verification (verify expiration date and signature) rather than just decoding
        if (!payload) return false;

        // Verify license
        const licenseId = payload.lic;
        const licenseKey = payload.secret;
        
        const [results] = await db.query("SELECT * FROM licenses WHERE id = ? AND license_secret = ?;", [licenseId, licenseKey]);
        return (results as mysql.RowDataPacket[]).length === 1;
    } catch (err) {
        console.warn('error validating token', err);
    }
    return false;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware for all API requests
app.use("/api/*", async (c, next) => {
    return cors({
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
    })(c, next);
});

// URL-to-ZPL conversions
app.use("/api/v2/convert/url/to/zpl/*", async (c, next) => {
    return every(
        hyperdrive({
            hyperdrive: c.env.DB,
        }),
        bearerAuth({
            verifyToken: validateLicense,
        })
    )(c, next);
});
app.get("/api/v2/convert/url/to/zpl/:url{.+}", async (c) => proxy(c.req.param('url')));

// All other conversions
app.use("/api/v2/convert/:sourceFormat/to/:targetFormat", requestId({
    headerName: 'X-LZ-Request-Id',
    generator: () => new Date().toISOString().substring(0, 19).replaceAll('-', '/').replaceAll('T', '/').replaceAll(':', '') + '--' + crypto.randomUUID(),
}));
app.use("/api/v2/convert/:sourceFormat/to/:targetFormat", async (c, next) => {
    return logToR2({
        ...c.req.param(),
        r2Bucket: c.env.LZ_R2_BUCKET,
        sampleRate: c.env.LZ_LOG_SAMPLE_RATE,
    })(c, next);
});

// All other requests
app.use(forceRelativeRedirects());
app.notFound(async (c) => {
    return proxyToBackend({
        baseUrl: c.env.LZ_PROD_API_BASE_URL,
        headers: {
            'X-LZ-IP': c.req.header("Cf-Connecting-Ip") ?? c.req.header("X-Forwarded-For") ?? '',
            'X-LZ-Secret-Key': c.env.LZ_PROD_API_SECRET_KEY,
        },
    })(c);
});

export default app;
