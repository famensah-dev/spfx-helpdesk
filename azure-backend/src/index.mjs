import http from 'node:http';
import {JSDOM} from 'jsdom';
import {readConfig} from './config.mjs';
import {tokenValidator} from './tokens.mjs';
import {createServices} from './services.mjs';
import {dispatch} from './dispatch.mjs';
import {handler} from './http.mjs';
// Shared sanitization uses an inert DOM. Scripts and external resources stay disabled.
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const config=readConfig();
const server=http.createServer(handler({config,validate:tokenValidator(config),createServices:(assertion,claims)=>createServices(config,assertion,claims),dispatch}));
server.requestTimeout=180000;server.headersTimeout=15000;
server.listen(Number(process.env.DESKPILOT_API_PORT||7071),'127.0.0.1',()=>console.log('DeskPilot Azure API listening locally.'));
