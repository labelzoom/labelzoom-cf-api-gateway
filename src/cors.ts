/* CORS-safelisted response headers:
 * - Cache-Control
 * - Content-Language
 * - Content-Length
 * - Content-Type
 * - Expires
 * - Last-Modified
 * - Pragma
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Retry-After, X-LZ-Request-ID",
};

/**
 * Handle OPTIONS request for CORS
 * @param request 
 * @returns 
 */
export async function handleOptions(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? '';

    if (!env.LZ_ALLOWED_ORIGINS.includes(origin)) {
        return new Response(`Origin ${origin} not allowed`, { status: 403 });
    }

    if (
        origin !== '' &&
        request.headers.get("Access-Control-Request-Method") !== null &&
        request.headers.get("Access-Control-Request-Headers") !== null
    ) {
        // Handle CORS preflight requests.
        return new Response(null, {
            headers: {
                ...corsHeaders,
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") ?? '',
            },
        });
    } else {
        // Handle standard OPTIONS request.
        return new Response(null, {
            headers: {
                Allow: "GET,HEAD,POST,PUT,DELETE,OPTIONS",
            },
        });
    }
}

/**
 * Add access control headers to API request
 * @param response 
 * @param origin 
 * @returns 
 */
export function responseWithAllowOrigin(response: Response, origin = '*'): Response {
    // Clone the response so that it's no longer immutable
    const newResponse = new Response(response.body, response);

    // Add cache control headers
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    newResponse.headers.set('Access-Control-Expose-Headers', 'X-LZ-Request-ID');

    return newResponse;
}
