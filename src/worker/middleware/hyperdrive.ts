import mysql from 'mysql2/promise';
import { MiddlewareHandler } from "hono";
import { Connection } from '../types/connection';

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

export type HyperdriveOptions = {
    hyperdrive?: Hyperdrive;
};

export const hyperdrive = (hyperdriveOptions: HyperdriveOptions = {}): MiddlewareHandler => {
    const hyperdriveConfig = hyperdriveOptions.hyperdrive;
    if (!hyperdriveConfig) throw new Error('hyperdrive middleware requires hyperdrive configuration');

    return async function hyperdrive(c, next) {
        c.set('db', await getConnection(hyperdriveConfig))
        await next();
    }
}
