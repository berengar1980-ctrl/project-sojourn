import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'sojourn-hardpoint-editor-save',
      configureServer(server) {
        server.middlewares.use('/__sojourn/hardpoints/save', (request, response, next) => {
          if (request.method !== 'POST') {
            next();
            return;
          }

          let body = '';
          request.setEncoding('utf8');
          request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2_000_000) request.destroy();
          });
          request.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { id?: unknown; data?: unknown };
              if (typeof payload.id !== 'string' || !/^[a-z0-9-]+$/.test(payload.id)) {
                response.statusCode = 400;
                response.end('Invalid ship id');
                return;
              }
              if (!payload.data || typeof payload.data !== 'object') {
                response.statusCode = 400;
                response.end('Invalid hardpoint data');
                return;
              }

              const target = resolve(
                projectRoot,
                'src',
                'data',
                'ships',
                payload.id + '.hardpoints.json'
              );
              await writeFile(target, JSON.stringify(payload.data, null, 2) + '\n', 'utf8');
              response.statusCode = 204;
              response.end();
            } catch (error) {
              response.statusCode = 500;
              response.end(error instanceof Error ? error.message : String(error));
            }
          });
        });
      },
    },
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
