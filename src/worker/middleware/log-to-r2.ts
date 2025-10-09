import { HonoRequest, MiddlewareHandler } from "hono";

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

export type LogToR2Options = {
    r2Bucket?: R2Bucket;
    sourceFormat?: string;
    targetFormat?: string;
    sampleRate?: number;
};

export const logToR2 = ({
    r2Bucket = undefined,
    sourceFormat = 'json',
    targetFormat = 'json',
    sampleRate = 1.0,
}: LogToR2Options = {}): MiddlewareHandler => {
    if (!sourceFormat || !targetFormat) throw new Error('LogToR2 middleware requires source format and target format so file extensions and content types can be set properly');
    if (!r2Bucket) throw new Error('LogToR2 middleware requires r2bucket');

    return async (c, next) => {
        const loggingEnabled = Math.random() < sampleRate;
        if (!loggingEnabled) return await next();

        const requestId = c.get('requestId');
        let n: void | undefined;
        try {
            // TODO: Unwrap Base64 (if applicable) before storing in R2

            // Clone and log request asynchronously
            c.executionCtx.waitUntil(logRequest(c.req, requestId, sourceFormat, r2Bucket));

            // Await response
            n = await next();

            // Clone and log response asynchronously
            c.executionCtx.waitUntil(logResponse(c.res, requestId, targetFormat, r2Bucket));

            // TODO: Log all server errors
            // if (!loggingEnabled && isServerError(response)) {
            //     ctx.waitUntil(Promise.all([
            //         r2Bucket.put(`err/${requestID}/in.${sourceFormat}`, request.clone().body, { httpMetadata: { contentType: getContentType(sourceFormat) } }),
            //         r2Bucket.put(`err/${requestID}/params.json`, url.searchParams.get('params'), { httpMetadata: { contentType: 'application/json' } }),
            //         r2Bucket.put(`err/${requestID}/out.${targetFormat}`, response.clone().body, { httpMetadata: { contentType: getContentType(targetFormat) } }),
            //     ]));
            // }
        } catch (err) {
            console.error(`error logging conversion data for request ${requestId}`, err);
        }

        return n ?? await next();
    };
};

async function logRequest(req: HonoRequest, requestId: string, sourceFormat: string, r2Bucket: R2Bucket) {
    return Promise.all([
        r2Bucket.put(`${requestId}/in.${sourceFormat}`, await req.raw.clone().blob(), { httpMetadata: { contentType: getContentType(sourceFormat) } }),
        r2Bucket.put(`${requestId}/params.json`, req.query('params') ?? '', { httpMetadata: { contentType: 'application/json' } }),
    ]);
}

async function logResponse(res: Response, requestId: string, targetFormat: string, r2Bucket: R2Bucket) {
    return r2Bucket.put(`${requestId}/out.${targetFormat}`, await res.clone().blob(), { httpMetadata: { contentType: getContentType(targetFormat) } });
}
