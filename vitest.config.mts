import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: './wrangler.jsonc' },
            },
        },
        reporters: [
            'default',
            ['junit', { suiteName: 'Unit and Integration tests' }],
        ],
        outputFile: {
            junit: './junit-report.xml',
        }
    },
});
