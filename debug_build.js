import { build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runBuild() {
  try {
    await build({
      configFile: './vite.config.ts'
    });
    console.log('Build successful!');
  } catch (err) {
    console.error('Build FAILED:');
    if (err.errors) {
       console.error('Detailed Errors:', JSON.stringify(err.errors, null, 2));
    } else {
       console.error(err);
    }
    process.exit(1);
  }
}

runBuild();
