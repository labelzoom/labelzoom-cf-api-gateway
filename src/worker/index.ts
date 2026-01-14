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
import { hyperdriveMysql } from "./middleware/hyperdrive-mysql";
import { bearerAuth } from "hono/bearer-auth";
import { logger } from "hono/logger";
import { GET_CUSTOMER_ID_FROM_LICENSE_SQL, GET_LATEST_VERSION_SQL, VERIFY_LICENSE_SQL } from "./constants";
import { HTTPException } from "hono/http-exception";
import { logTelemetry } from "./middleware/log-telemetry";

const JWT_REGEX = /^[A-Za-z0-9_-]{2,}(?:\.[A-Za-z0-9_-]{2,}){2}$/;

async function verifyTokenAndLicense(token: string, c: Context) {
    const db = c.get('db');
    if (!db) throw new Error('license verifier must be used with (and sequenced after) the hyperdrive middleware');

    try {
        const { payload } = decode(token); // TODO: Add token verification (verify expiration date and signature) rather than just decoding
        if (!payload) return false;

        // Verify license
        const licenseId = payload.lic;
        const licenseKey = payload.secret;
        const [results] = await db.query(VERIFY_LICENSE_SQL, [licenseId, licenseKey]);
        return (results as mysql.RowDataPacket[]).length === 1;
    } catch (err) {
        console.warn('error verifying token', err);
    }
    return false;
}

async function getCustomerIdFromAuth(c: Context) {
    try {
        const auth = c.req.header('Authorization') ?? '';
        if (!auth.startsWith('Bearer ')) return undefined;
        const token = auth.substring(7);
        if (JWT_REGEX.test(token))
        {
            const { payload } = decode(token); // TODO: Add token verification (verify expiration date and signature) rather than just decoding
            if (!payload) return undefined;

            // Verify license
            const db = c.get('db');
            if (!db) throw new Error('hyperdrive middleware must be used to retrieve customer ID from JWTs');
            const licenseId = payload.lic;
            const licenseKey = payload.secret;
            const [results] = await db.query(GET_CUSTOMER_ID_FROM_LICENSE_SQL, [licenseId, licenseKey]);

            const customerId = (results as mysql.RowDataPacket[])[0]?.company_name;
            if (customerId?.startsWith('cus_')) return customerId;
        }
        // TODO: Add support for static API keys
    } catch (err) {
        console.warn('error getting customer id from auth', err);
    }
    return undefined;
}

const app = new Hono<{ Bindings: Env }>();

//#region Debug and logging
app.use((c, next) => {
    if (c.env.ENVIRONMENT === 'dev') {
        return logger()(c, next);
    }
    return next();
});
//#endregion

//#region Middleware for all API requests
app.use("/api/*", (c, next) => {
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
//#endregion

//#region URL-to-ZPL conversions
app.use("/api/v2/convert/url/to/zpl/*", (c, next) => {
    return every(
        hyperdriveMysql({
            config: c.env.DB,
        }),
        bearerAuth({
            verifyToken: verifyTokenAndLicense,
            invalidTokenMessage: 'Unauthorized: invalid token or license',
        }),
    )(c, next);
});
app.get("/api/v2/convert/url/to/zpl/:url{.+}", (c) => proxy(c.req.param('url')));
//#endregion

//#region All other conversions
app.use("/api/:version{v[\\d.]+}/convert/:sourceFormat/to/:targetFormat", (c, next) => {
    return every(
        (c, next) => {
            if ((c.req.header('Content-Type') ?? '') === '') {
                throw new HTTPException(400, { message: 'Content-Type header is required' });
            }
            if (c.req.raw.body === null) {
                throw new HTTPException(400, { message: 'Request body is required' });
            }
            if (Number(c.req.header('Content-Length') ?? '-1') === 0) {
                throw new HTTPException(400, { message: 'Request body is required but Content-Length was 0' });
            }
            return next();
        },
        requestId({
            headerName: 'X-LZ-Request-Id',
            generator: () => new Date().toISOString().substring(0, 19).replaceAll('-', '/').replaceAll('T', '/').replaceAll(':', '') + '--' + crypto.randomUUID(),
        }),
        logToR2({
            ...c.req.param(),
            r2Bucket: c.env.LZ_R2_BUCKET,
            sampleRate: c.env.LZ_LOG_SAMPLE_RATE,
        }),
        hyperdriveMysql({
            config: c.env.DB,
        }),
        async (c, next) => {
            const customerId = await getCustomerIdFromAuth(c);
            if (customerId) {
                const queue = c.env.API_REQUESTS_QUEUE as Queue<any>;
                await queue.send({
                    customer: customerId,
                    event_name: 'api_requests',
                });
            }
            return next();
        },
        logTelemetry(),
    )(c, next);
});
//#endregion

//#region Download redirects
app.use("/download/*", (c, next) => {
    return hyperdriveMysql({
        config: c.env.DB,
    })(c, next);
});
app.get("/download/:version/:packageName", async (c) => {
    let { version, packageName } = c.req.param();
    if (version === 'latest') {
        const db = c.get('db');
        if (!db) throw new Error('download controller must be used with (and sequenced after) the hyperdrive middleware');
        const [results] = await db.query(GET_LATEST_VERSION_SQL);
        const rows = results as mysql.RowDataPacket[];
        version = `${rows[0].major}.${rows[0].minor}.${rows[0].revision}`;
    }
    return c.redirect(`${c.env.S3_BUCKET}/${version}/${packageName}`);
});
//#endregion

//#region Diagnostics
app.use("/api/v2/heartbeat/db-hyperdrive", (c, next) => {
    return hyperdriveMysql({
        config: c.env.DB,
    })(c, next);
});
app.get("/api/v2/heartbeat/db-hyperdrive", async (c) => {
    const db = c.get('db');
    if (!db) throw new Error('heartbeat must be used with (and sequenced after) the hyperdrive middleware');
    
    try {
        const [results] = await db.query('SELECT 1');
        if ((results as mysql.RowDataPacket[]).length !== 1) {
            throw new Error("Unexpected result from database");
        }
        return c.text('OK');
    } catch (err) {
        if (err instanceof Error) {
            throw new HTTPException(500, { message: err.message, cause: err });
        }
        throw new HTTPException(500, { message: 'Unknown error', cause: err });
    }
});
//#endregion

//#region All other requests
app.all("/api/admin/*", (c) => c.json({ message: 'Forbidden' }, 403));
app.use(forceRelativeRedirects());
app.notFound((c) => {
    const originalHost = c.req.header('X-LZ-Original-Host') ?? (new URL(c.req.url)).hostname;
    return proxyToBackend({
        baseUrl: c.env.LZ_PROD_API_BASE_URL,
        headers: {
            'X-LZ-Request-Id': c.get('requestId'),
            'X-LZ-IP': c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || '',
            'X-LZ-Secret-Key': c.env.LZ_PROD_API_SECRET_KEY,
            'X-LZ-Original-Host': originalHost,
        },
    })(c);
});
//#endregion

export default app;
