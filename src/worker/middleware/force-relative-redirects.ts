import { MiddlewareHandler } from "hono";

/**
 * Force redirects to be relative
 * @returns 
 */
export const forceRelativeRedirects = (): MiddlewareHandler => {
    return async function stripHostFromRedirect(c, next) {
        await next();
        
        const response = c.res;
        if (response.status === 301 || response.status === 302) {
            const locationHeader = response.headers.get('Location') ?? '';
            try {
                const url = new URL(locationHeader);

                const newResponse = new Response(response.body, response);
                newResponse.headers.set('Location', url.pathname + url.search);
                c.res = newResponse;
            } catch {
                // Failed to parse location header as URL, it's already relative so do nothing
            }
        }
    };
};
