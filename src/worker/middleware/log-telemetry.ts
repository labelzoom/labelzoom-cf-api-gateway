import { MiddlewareHandler } from "hono";

export const logTelemetry = ({} = {}): MiddlewareHandler => {
    return async (c, next) => {
        const queue = c.env.API_REQUESTS_QUEUE;
        const ts = new Date();
        const startTime = performance.now();
        await next();
        const endTime = performance.now();
        const duration = endTime - startTime;
        try {
            c.executionCtx.waitUntil(queue.send({
                url: c.req.url,
                requestHeaders: Object.fromEntries(c.req.raw.headers.entries()),
                responseHeaders: Object.fromEntries(c.res.headers.entries()),
                responseStatus: c.res.status,
                ts,
                duration,
            }));
        } catch (err) {
            console.error('error logging telemetry', err);
        }
    };
};
