/**
 * @module
 * Cloudflare Hyperdrive Middleware for Hono.
 */

import mysql from 'mysql2/promise';
import { MiddlewareHandler } from "hono";

/**
 * @todo TODO: Get rid of this once Cloudflare adds this type to the output of `wrangler types`
 */
export type Connection = mysql.Connection & {
    query(sql: string, values: any): Promise<[mysql.OkPacket | mysql.ResultSetHeader | mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket[], mysql.FieldPacket[]]>;
};

async function getConnection(hyperdrive: Hyperdrive): Promise<Connection> {
    return (await mysql.createConnection({
        host: hyperdrive.host,
        user: hyperdrive.user,
        password: hyperdrive.password,
        database: hyperdrive.database,
        port: hyperdrive.port,

        // The following line is needed for mysql2 compatibility with Workers
        // mysql2 uses eval() to optimize result parsing for rows with > 100 columns
        // Configure mysql2 to use static parsing instead of eval() parsing with disableEval
        disableEval: true,
    }) as Connection);
}

export type HyperdriveVariables = {
    db: Connection;
};

export type HyperdriveOptions = {
    config?: Hyperdrive;
};

/**
 * Cloudflare Hyperdrive Middleware for Hono.
 * @param options 
 * @returns 
 */
export const hyperdriveMysql = (options: HyperdriveOptions = {}): MiddlewareHandler => {
    const hyperdriveConfig = options.config;
    if (!hyperdriveConfig) throw new Error('hyperdrive middleware requires hyperdrive configuration');

    return async (c, next) => {
        const connection = await getConnection(hyperdriveConfig);
        c.set('db', connection);
        await next();
        c.executionCtx.waitUntil(connection.end());
    };
}
