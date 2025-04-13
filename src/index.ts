/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { handleOptions, responseWithAllowOrigin } from "./cors";

const LABEL_CONVERSION_PATH_PATTERN = /^\/api\/v2\/convert\/[a-z]+\/to\/[a-z]+\/?$/i;

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
 * Log conversion request and response data to Cloudflare R2
 * @param request 
 * @param env 
 * @param ctx 
 * @param url 
 * @returns 
 */
async function handleConversionLog(request: Request<unknown, IncomingRequestCfProperties<unknown>>, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
    try {
        const requestID = new Date().toISOString().substring(0, 19).replaceAll('-', '/').replaceAll('T', '/').replaceAll(':', '') + '--' + crypto.randomUUID();
        const loggingEnabled = Math.random() < env.LZ_LOG_SAMPLE_RATE;
    
        // Example path: [0]/[1]api/[2]v2/[3]convert/[4]zpl/[5]to/[6]pdf
        const conversionPathParts = url.pathname.split('/');
        const sourceFormat = conversionPathParts[4].toLowerCase();
        const targetFormat = conversionPathParts[6].toLowerCase();

        // TODO: Unwrap Base64 (if applicable) before storing in R2
    
        // Clone and log request asynchronously
        if (loggingEnabled) ctx.waitUntil(Promise.all([
            env.LZ_R2_BUCKET.put(`${requestID}/in.${sourceFormat}`, request.clone().body, {httpMetadata:{contentType:getContentType(sourceFormat)}}),
            env.LZ_R2_BUCKET.put(`${requestID}/params.json`, url.searchParams.get('params'), {httpMetadata:{contentType:'application/json'}}),
        ]));
    
        // Generate response
        const response = await proxyRequestToBackend(request, url, env, requestID);
    
        // Clone and log response asynchronously
        if (loggingEnabled) ctx.waitUntil(
            env.LZ_R2_BUCKET.put(`${requestID}/out.${targetFormat}`, response.clone().body, {httpMetadata:{contentType:getContentType(targetFormat)}})
        );
    
        // Return response to client
        return response;
    } catch (error) {
        console.error("error logging conversion data", error);
        return await proxyRequestToBackend(request, url, env);
    }
}

/**
 * Adds X-LZ-IP header to mimic the original behavior of the Cloudflare IP passthrough, then passes the request to the backend URL
 * @param request 
 * @param backendUrl 
 * @returns 
 */
async function proxyRequestToBackend(request: Request, url: URL, env: Env, requestID = ''): Promise<Response> {
    const backendUrl = env.LZ_PROD_API_BASE_URL + url.pathname + url.search;
    const newRequest = new Request(backendUrl, request);
    let ip = request.headers.get("X-Forwarded-For") ?? '';
    if (!ip) {
        ip = request.headers.get("Cf-Connecting-Ip") ?? '';
    }
    newRequest.headers.set('X-LZ-IP', ip);
    newRequest.headers.set('X-LZ-Secret-Key', env.LZ_PROD_API_SECRET_KEY)
    if (requestID) newRequest.headers.set("X-LZ-Request-ID", requestID);
    const response = await fetch(newRequest);
    
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
}

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);
        
        // Edge request validation and filtering
        if (url.pathname.startsWith('/api/v2/')) {
            if (request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data')) return Response.json({message:"multipart/form-data is not supported. Please see our API documentation at https://api.labelzoom.net/api"}, { status: 400 });
        }

        // API modifiers
        if (url.pathname.startsWith('/api/')) {
            if (request.method === "OPTIONS") {
                // Handle CORS preflight requests
                return handleOptions(request, env);
            }
            if (LABEL_CONVERSION_PATH_PATTERN.test(url.pathname)) {
                return responseWithAllowOrigin(
                    await handleConversionLog(request, env, ctx, url),
                    request.headers.get('Origin') ?? '*'
                );
            }

            // Fallthrough behavior, proxy request to Spring Web
            return responseWithAllowOrigin(
                await proxyRequestToBackend(request, url, env),
                request.headers.get('Origin') ?? '*'
            );
        } else if (url.pathname === '/api') {
            // Force trailing slash after /api
            url.pathname = '/api/';
            return Response.redirect(url.toString());
        }

        // TODO: Eventually we'll wall off access to the rest of the endpoints once everything has been fully migrated
        // return new Response(`Not found`, { status: 404 });

        // Fallthrough behavior, proxy request to Spring Web
        return responseWithAllowOrigin(
            await proxyRequestToBackend(request, url, env),
            request.headers.get('Origin') ?? '*'
        );
    },
} satisfies ExportedHandler<Env>;
