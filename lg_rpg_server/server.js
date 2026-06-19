// Starts the game server by initializing routes, socket handlers, and the game loop.
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

server.listen(SERVER_CONFIG.port, () => {
  console.log(`Server is running at port ${SERVER_CONFIG.port}`);
});
