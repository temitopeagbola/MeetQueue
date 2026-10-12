import { defineConfig } from '@neon/config/v1';

// AI Gateway needs a paid plan; once upgraded, add: preview: { aiGateway: true },
export default defineConfig({
  functions: {
    api: { name: 'api', source: './hello.ts' },
  },
});
