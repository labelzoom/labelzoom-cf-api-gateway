import { Hono, HonoRequest } from "hono";
import { cors } from 'hono/cors';
import { HTTPException } from "hono/http-exception";
import { decode } from 'hono/jwt'
import { proxy } from "hono/proxy";
import { requestId } from "hono/request-id";
import mysql from 'mysql2/promise';

/**
 * TODO: Get rid of this once Cloudflare adds this type to the output of `wrangler types`
 */
type Connection = mysql.Connection & {
    query(sql: string, values: any): Promise<[mysql.OkPacket | mysql.ResultSetHeader | mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket[], mysql.FieldPacket[]]>;
};

async function getConnection(env: Env): Promise<Connection> {
    return (await mysql.createConnection({
        host: env.DB.host,
        user: env.DB.user,
        password: env.DB.password,
        database: env.DB.database,
        port: env.DB.port,
        // The following line is needed for mysql2 compatibility with Workers
        // mysql2 uses eval() to optimize result parsing for rows with > 100 columns
        // Configure mysql2 to use static parsing instead of eval() parsing with disableEval
        disableEval: true,
    }) as Connection);
}

function getContentType(fileExtension: string): string | undefined {
    switch (fileExtension) {
        case "json": return "application/json";
        case "xml":  return "application/xml";
        case "zpl":  return "text/plain";
        case "png":  return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":  return "image/gif";
        case "bmp":  return "image/bmp";
        case "pdf":  return "application/pdf";
        default:     return undefined;
    }
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
    const [results] = await db.query("SELECT * FROM licenses WHERE id = ? AND license_secret = ?;", [licenseId, licenseKey]);
    if ((results as mysql.RowDataPacket[]).length !== 1) throw new HTTPException(401, { message: "Invalid license" });
}

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
    const corsWithVars = cors({
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
    return corsWithVars(c, next);
});

app.get("/api/v2/convert/url/to/zpl/:url{.+}", async (c) => {
    const url = new URL(c.req.param('url') ?? '');
    await validateLicense(c.env, c.req);
    return proxy(url);
});

app.use("/api/v2/convert/:sourceFormat/to/:targetFormat", requestId({
    headerName: 'X-LZ-Request-Id',
    generator: () => new Date().toISOString().substring(0, 19).replaceAll('-', '/').replaceAll('T', '/').replaceAll(':', '') + '--' + crypto.randomUUID(),
}));

app.use("/api/v2/convert/:sourceFormat/to/:targetFormat", async (c, next) => {
    let n;
    try {
        const requestID = c.get('requestId');
        const loggingEnabled = Math.random() < c.env.LZ_LOG_SAMPLE_RATE;
        const { sourceFormat, targetFormat } = c.req.param();

        // TODO: Unwrap Base64 (if applicable) before storing in R2

        // Clone and log request asynchronously
        if (loggingEnabled) c.executionCtx.waitUntil(Promise.all([
            c.env.LZ_R2_BUCKET.put(`${requestID}/in.${sourceFormat}`, await c.req.raw.clone().blob(), { httpMetadata: { contentType: getContentType(sourceFormat) } }),
            c.env.LZ_R2_BUCKET.put(`${requestID}/params.json`, c.req.query('params') ?? '', { httpMetadata: { contentType: 'application/json' } }),
        ]));

        // Generate response
        n = await next();

        // Clone and log response asynchronously
        if (loggingEnabled) c.executionCtx.waitUntil(
            c.env.LZ_R2_BUCKET.put(`${requestID}/out.${targetFormat}`, await c.res.clone().blob(), { httpMetadata: { contentType: getContentType(targetFormat) } })
        );

        // TODO: Log all server errors
        // if (!loggingEnabled && isServerError(response)) {
        //     ctx.waitUntil(Promise.all([
        //         env.LZ_R2_BUCKET.put(`err/${requestID}/in.${sourceFormat}`, request.clone().body, { httpMetadata: { contentType: getContentType(sourceFormat) } }),
        //         env.LZ_R2_BUCKET.put(`err/${requestID}/params.json`, url.searchParams.get('params'), { httpMetadata: { contentType: 'application/json' } }),
        //         env.LZ_R2_BUCKET.put(`err/${requestID}/out.${targetFormat}`, response.clone().body, { httpMetadata: { contentType: getContentType(targetFormat) } }),
        //     ]));
        // }
    } catch (err) {
        console.error("error logging conversion data", err);
    }
    return n ?? await next();
});

app.notFound(async (c) => {
    const url = new URL(c.req.url);
    const backendUrl = c.env.LZ_PROD_API_BASE_URL + url.pathname + url.search;
    const response = await proxy(backendUrl, {
        ...c.req,
        headers: {
            ...c.req.header(),
            'X-LZ-IP': c.req.header("Cf-Connecting-Ip") ?? c.req.header("X-Forwarded-For") ?? '',
            'X-LZ-Secret-Key': c.env.LZ_PROD_API_SECRET_KEY,
        }
    });
    
    // Force redirects to be relative because I couldn't get it to work in Spring Boot
    if (response.status === 301 || response.status === 302) {
        const locationHeader = response.headers.get('Location') ?? '';
        if (locationHeader.includes('labelzoom.net/')) {
            const url = new URL(locationHeader);

            const newResponse = new Response(response.body, response);
            newResponse.headers.set('Location', url.pathname + url.search);
            return newResponse;
        }
    }

    return response;
});

export default app;
