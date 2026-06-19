import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { SERVER_CONFIG } from '../game_constants.js';
import { publicDir } from './paths.js';

export const app = express();
export const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: SERVER_CONFIG.corsOrigin } });

// Serve public files and force the browser to always download the newest version.
app.use(express.static(publicDir, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
