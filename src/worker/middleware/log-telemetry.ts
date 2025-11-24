import { MiddlewareHandler } from "hono";

export const logTelemetry = ({} = {}): MiddlewareHandler => {
    return async (c, next) => {
        const queue = c.env.API_REQUESTS_QUEUE;
        const ts = new Date();
        const startTime = performance.now();
        await next();
        const endTime = performance.now();
        const duration = endTime - startTime;
        c.executionCtx.waitUntil(queue.send({
            requestHeaders: c.req.raw.headers,
            responseHeaders: c.res.headers,
            ts,
            duration,
        }));
    };
};
