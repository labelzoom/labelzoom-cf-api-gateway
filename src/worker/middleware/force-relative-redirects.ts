import { MiddlewareHandler } from "hono";

function isRedirect(response: Response) {
    return response.status >= 300 && response.status < 400;
}

/**
 * Force redirects to be relative for all responses that may contain a `Location` header.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Location|Location Header - HTTP | MDN}
 * @returns 
 */
export const forceRelativeRedirects = (): MiddlewareHandler => {
    return async (c, next) => {
        await next();
        
        const response = c.res;
        if (isRedirect(response) || response.status === 201) {
            const locationHeader = response.headers.get('Location') ?? '';
            try {
                const url = new URL(locationHeader); // throws TypeError if not a full URL

                // URL parsed successfully, it's an absolute redirect rather than relative
                if (/\.?labelzoom\.net$/i.test(url.host)) {
                    c.res.headers.set('Location', url.pathname + url.search);
                }
            } catch {
                // failed to parse location header as URL, it's already a relative redirect (so do nothing)
            }
        }
    };
};
