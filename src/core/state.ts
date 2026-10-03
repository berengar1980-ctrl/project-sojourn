export interface PlayerState {
  locationId: string | null;
}

export interface GameState {
  version: number;
  player: PlayerState;
}

export function createInitialState(): GameState {
  return {
    version: 1,
    player: {
      locationId: null,
    },
  };
}
