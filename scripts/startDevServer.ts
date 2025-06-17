/* eslint-disable no-console */
import ngrok from '@ngrok/ngrok';
import { spawn } from 'child_process';

const PORT_1 = 3000
const PORT_2 = 3002
// Get your endpoint online
const listener = await ngrok.connect({ addr: PORT_1, authtoken: process.env.NGROK_AUTH_TOKEN_1 })
const listener2 = await ngrok.connect({ addr: PORT_2, authtoken: process.env.NGROK_AUTH_TOKEN_2 })
const nginxProxyUrl = listener.url()
const nginxProxyUrl2 = listener2.url()
console.log(`Ingress established at (${PORT_1} AwsInfraGuardianAgent): ${nginxProxyUrl}`)
console.log(`Ingress established at (${PORT_2} InfraGuardianTelegramBot): ${nginxProxyUrl2}`)

if(!nginxProxyUrl){
	console.log('No nginx proxy url found, exiting...')
	process.exit(1)
}

if(!nginxProxyUrl2){
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
    listener2.close();
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
