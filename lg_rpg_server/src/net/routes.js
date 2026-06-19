import {
  DEFAULT_GAME_MODE,
  GAME_MODE_LABELS,
  GAME_MODES,
  SERVER_CONFIG,
} from '../../game_constants.js';
import { app } from '../app.js';
import { state } from '../state.js';
import { getSelectedMapConfig } from '../maps.js';

export function registerRoutes() {
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/config', (_req, res) => {
    const selectedMapConfig = getSelectedMapConfig();

    res.json({
      totalScreens: SERVER_CONFIG.totalScreens,
      maxPlayers: SERVER_CONFIG.maxPlayers,
      phase: state.phase,
      defaultMode: DEFAULT_GAME_MODE,
      selectedMode: state.selectedMode,
      selectedModeLabel: selectedMapConfig.mode.label,
      map: selectedMapConfig.map,
      gameModes: Object.values(GAME_MODES).map((mode) => ({
        id: mode,
        label: GAME_MODE_LABELS[mode],
      })),
    });
  });
}
