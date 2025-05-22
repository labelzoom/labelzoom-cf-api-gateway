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
        return await proxy(backendUrl, {
            ...c.req,
            redirect: 'manual',
            headers: {
                ...c.req.header(),
                ...headers,
            }
        });
    }
};
