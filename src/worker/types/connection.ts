import mysql from 'mysql2/promise';

/**
 * @todo TODO: Get rid of this once Cloudflare adds this type to the output of `wrangler types`
 */
export type Connection = mysql.Connection & {
    query(sql: string, values: any): Promise<[mysql.OkPacket | mysql.ResultSetHeader | mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket[], mysql.FieldPacket[]]>;
};
