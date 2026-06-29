// Starts the game server by initializing routes, socket handlers, and the game loop.
import './src/lib/file-logger.js'; // mirror console output to logs/server.log (import first)
import { server } from './src/app.js';
import { SERVER_CONFIG } from './game_constants.js';
import { validateMapsManifest } from './src/maps.js';
import { registerRoutes } from './src/net/routes.js';
import { registerSocketHandlers } from './src/net/socket-handlers.js';
import { startGameLoop } from './src/game-loop.js';

validateMapsManifest();
registerRoutes();
registerSocketHandlers();
startGameLoop();

const has = (v) => ((v || '').trim() ? 'yes' : 'no');
console.log(
  `[config] port=${SERVER_CONFIG.port} totalScreens=${SERVER_CONFIG.totalScreens} ` +
  `cheerleader=${String(process.env.CHEERLEADER_ENABLED || '').toLowerCase()} ` +
  `geminiKey=${has(process.env.GEMINI_API_KEY)} awsKey=${has(process.env.AWS_ACCESS_KEY_ID)} awsRegion=${process.env.AWS_REGION || 'ap-south-1'}`,
);

server.listen(SERVER_CONFIG.port, () => {
  console.log(`Server is running at port ${SERVER_CONFIG.port}`);
});
