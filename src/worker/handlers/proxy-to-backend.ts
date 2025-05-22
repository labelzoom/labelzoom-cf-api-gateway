import { NotFoundHandler } from "hono";
import { proxy } from "hono/proxy";

export type ProxyToBackendOptions = {
    baseUrl?: string,
    headers?: HeadersInit,
};

export const proxyToBackend = ({
    baseUrl = undefined,
    headers = undefined,
}: ProxyToBackendOptions = {}): NotFoundHandler => {
    if (!baseUrl) throw new Error('proxy-to-backend handler requires backendBaseUrl');

    return async function proxyToBackend(c) {
        const url = new URL(c.req.url);
        const backendUrl = baseUrl + url.pathname + url.search;
        const response = await proxy(backendUrl, {
            ...c.req,
            headers: {
                ...c.req.header(),
                ...headers,
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
    }
};
