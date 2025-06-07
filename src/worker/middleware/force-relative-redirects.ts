import { MiddlewareHandler } from "hono";

/**
 * Force redirects to be relative
 * @returns 
 */
export const forceRelativeRedirects = (): MiddlewareHandler => {
    return async (c, next) => {
        await next();
        
        const response = c.res;
        if (response.status === 301 || response.status === 302) {
            const locationHeader = response.headers.get('Location') ?? '';
            try {
                const url = new URL(locationHeader); // throws TypeError if not a full URL

                // URL parsed successfully, it's an absolute redirect rather than relative
                if (/\.?labelzoom.net$/.test(url.host)) {
                    c.res.headers.set('Location', url.pathname + url.search);
                }
            } catch {
                // failed to parse location header as URL, it's already a relative redirect (so do nothing)
            }
        }
    };
};
