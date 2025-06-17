/* eslint-disable no-console */
import ngrok from '@ngrok/ngrok';
import { spawn } from 'child_process';

// Get your endpoint online
const listener = await ngrok.connect({ addr: 7378, authtoken_from_env: true })
const nginxProxyUrl = listener.url()
console.log(`Ingress established at: ${nginxProxyUrl}`)

if(!nginxProxyUrl){
	console.log('No nginx proxy url found, exiting...')
	process.exit(1)
}

// Wait for 'x' input to terminate
process.stdin.setEncoding('utf8');
console.log(`Type x to kill...`)
process.stdin.on('data', (data) => {
  if (data.toString().trim().toLowerCase() === 'x') {
    console.log('Terminating ngrok tunnel...');
    listener.close();
    process.exit(0);
  }else{
	console.log(`Uh no.. that's not 'x'.. staying alive..`)
  }
});

const developmentServerCommand = `bun run dev`;
console.log(`Starting development server with command: ${developmentServerCommand}`);

const processX = spawn('bun', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

processX.on('close', (code: number) => {
  console.log(`Development server exited with code ${code}`);
});
