import { createStartMenu, type StartMenuAction } from '../ui/start/start-menu';
import { createCampaignSelectionMenu } from '../ui/start/campaign-selection-menu';
import { campaignPackages } from '../data/campaigns/manifest';
import {
  createCampaignSelection,
  type CampaignSelection,
} from '../systems/campaigns/campaign-selection';
import { createCharacterEditor } from '../ui/start/character-editor';
import { createCampaignLoadingScreen } from '../ui/start/campaign-loading';
import { withPlayerShipName, type PlayerProfile } from '../core/player-profile';
import { createDuelLobby } from '../ui/start/duel-lobby';
import { createGameAudioService } from '../systems/audio/game-audio-service';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createNavigationService } from '../systems/navigation';
import { getShipDefinition, resolveShipGameplayStats } from '../systems/ships';
import { createGameController } from './game-controller';
import {
  prepareControllerCareer,
  type PreparedControllerCareer,
} from './game-controller-career-resume';
import { createCareerSaveStore } from '../systems/persistence/career-save-store';
import type { GameController } from './game-controller-types';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) throw new Error('HARROWDRIFT app root is missing.');
  showMainMenu(root, createCampaignSelection(campaignPackages));
}

function launchCampaign(
  root: HTMLElement,
  profile: PlayerProfile,
  selection: CampaignSelection,
  restored?: PreparedControllerCareer
): void {
  const ship = getShipDefinition(
    restored?.session.commerce.ships.activeShipId ?? 'salvage-100m-variant-01'
  );
  if (!ship) throw new Error('SOJOURN starting ship is missing.');

  const loading = createCampaignLoadingScreen();
  let running = true;
  let game: GameController | null = null;
  let previousTime = 0;

  const frame = (time: number): void => {
    if (!running || !game) return;
    const deltaSeconds = (time - previousTime) / 1000;
    previousTime = time;
    game.tick(deltaSeconds);
    requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (!running) return;
    try {
      const navigation =
        restored?.session.navigationWorld.navigation ??
        createNavigationService(
          narrowsSector,
          narrowsSector.startLocationId,
          ship.navigation.cruiseSpeed
        );
      game = createGameController({
        root,
        ship: withPlayerShipName(ship, profile, 'salvage-100m-variant-01'),
        playerProfile: profile,
        navigation,
        campaignSelection: selection.snapshot(),
        restoredSession: restored?.session,
        onCareerContextReady: restored?.bindController,
        onReturnToMainMenu: () => {
          if (!running) return;
          running = false;
          loading.destroy();
          game?.destroy();
          showMainMenu(root, selection);
        },
      });
      loading.update(1);
      loading.destroy();
      previousTime = performance.now();
      requestAnimationFrame(frame);
    } catch (error) {
      running = false;
      loading.destroy();
      showMainMenu(root, selection);
      throw error;
    }
  };

  // Allow the loading screen to be painted before any world construction.
  requestAnimationFrame(() => requestAnimationFrame(start));
}

function canContinueCareer(): boolean {
  try {
    return createCareerSaveStore(window.localStorage).read().ok;
  } catch {
    return false;
  }
}

function showMainMenu(root: HTMLElement, selection: CampaignSelection): void {
  document.querySelector('.settings-menu')?.remove();
  document.body.classList.remove('app-has-system-bar');
  let current: { destroy(): void } | null = null;
  const navigate = (action: StartMenuAction): void => {
    current?.destroy();
    if (action === 'campaign') {
      current = createCharacterEditor(
        root,
        (profile) => {
          current?.destroy();
          launchCampaign(root, profile, selection);
        },
        () => showMainMenu(root, selection),
        resolveShipGameplayStats(getShipDefinition('salvage-100m-variant-01')!).stations
      );
    } else if (action === 'continue') {
      try {
        const saved = createCareerSaveStore(window.localStorage).read();
        if (!saved.ok) throw new Error('Kein gültiger Karriere-Spielstand vorhanden.');
        const staged = prepareControllerCareer(saved.snapshot);
        launchCampaign(root, staged.session.profile, selection, staged);
      } catch (error) {
        showMainMenu(root, selection);
        window.alert(
          error instanceof Error
            ? error.message
            : 'Der Karriere-Spielstand kann nicht geladen werden.'
        );
      }
    } else if (action === 'campaigns') {
      current = createCampaignSelectionMenu(
        root,
        selection,
        () => showMainMenu(root, selection),
        () => navigate('campaign')
      );
    } else if (action === 'pvp') {
      current = createDuelLobby(root, () => {
        current?.destroy();
        showMainMenu(root, selection);
      });
    } else if (action === 'options') {
      showStartOptions(root, () => showMainMenu(root, selection));
    } else {
      root.replaceChildren();
      const button = document.createElement('button');
      button.textContent = 'Zurück zum Hauptmenü';
      button.addEventListener('click', () => showMainMenu(root, selection));
      root.append(button);
    }
  };
  current = createStartMenu(root, navigate, canContinueCareer());
}

function showStartOptions(root: HTMLElement, back: () => void): void {
  const audio = createGameAudioService();
  const screen = document.createElement('section');
  screen.className = 'harrow-duel';
  const title = document.createElement('h1');
  title.textContent = 'HARROWDRIFT · OPTIONEN';
  const description = document.createElement('p');
  description.textContent = 'Audioeinstellungen gelten auch im Kampagnenspiel.';
  screen.append(title, description);
  const addSlider = (label: string, volume: number, onChange: (value: number) => void): void => {
    const row = document.createElement('label');
    row.className = 'harrow-options__slider';
    row.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(volume * 100));
    const output = document.createElement('output');
    output.textContent = input.value + '%';
    input.addEventListener('input', () => {
      onChange(Number(input.value) / 100);
      output.textContent = input.value + '%';
    });
    row.append(input, output);
    screen.append(row);
  };
  const settings = audio.getSettings();
  addSlider('Umgebungslautstärke', settings.ambienceVolume, (value) =>
    audio.setAmbienceVolume(value)
  );
  addSlider('RCS-Lautstärke', settings.rcsVolume, (value) => audio.setRcsVolume(value));
  const button = document.createElement('button');
  button.textContent = 'Zurück zum Hauptmenü';
  button.addEventListener('click', () => {
    audio.destroy();
    back();
  });
  screen.append(button);
  root.replaceChildren(screen);
}
