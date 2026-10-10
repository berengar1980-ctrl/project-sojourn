import { createStartMenu, type StartMenuAction } from '../ui/start/start-menu';
import { createDuelLobby } from '../ui/start/duel-lobby';
import { createGameAudioService } from '../systems/audio/game-audio-service';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createNavigationService } from '../systems/navigation';
import { getShipDefinition } from '../systems/ships';
import { createGameController } from './game-controller';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) throw new Error('HARROWDRIFT app root is missing.');
  showMainMenu(root);
}

function launchCampaign(root: HTMLElement): void {

  const ship = getShipDefinition('salvage-100m-variant-01');
  if (!ship) throw new Error('SOJOURN starting ship is missing.');

  const navigation = createNavigationService(
    narrowsSector,
    narrowsSector.startLocationId,
    ship.navigation.cruiseSpeed
  );
  const game = createGameController({ root, ship, navigation });

  let previousTime = performance.now();
  const frame = (time: number): void => {
    const deltaSeconds = (time - previousTime) / 1000;
    previousTime = time;
    game.tick(deltaSeconds);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

function showMainMenu(root: HTMLElement): void {
  document.querySelector('.settings-menu')?.remove();
  let current: { destroy(): void } | null = null;
  const navigate = (action: StartMenuAction): void => {
    current?.destroy();
    if (action === 'campaign') {
      launchCampaign(root);
    } else if (action === 'pvp') {
      current = createDuelLobby(root, () => {
        current?.destroy();
        showMainMenu(root);
      });
    } else if (action === 'options') {
      showStartOptions(root, () => showMainMenu(root));
    } else {
      root.replaceChildren();
      const button = document.createElement('button');
      button.textContent = 'Zurück zum Hauptmenü';
      button.addEventListener('click', () => showMainMenu(root));
      root.append(button);
    }
  };
  current = createStartMenu(root, navigate);
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
  const addSlider = (
    label: string,
    volume: number,
    onChange: (value: number) => void
  ): void => {
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
  addSlider('RCS-Lautstärke', settings.rcsVolume, (value) =>
    audio.setRcsVolume(value)
  );
  const button = document.createElement('button');
  button.textContent = 'Zurück zum Hauptmenü';
  button.addEventListener('click', () => {
    audio.destroy();
    back();
  });
  screen.append(button);
  root.replaceChildren(screen);
}
