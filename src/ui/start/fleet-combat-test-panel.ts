import type { FleetCombatService } from '../../systems/combat/fleet-combat-service';

function renderFleetCanvas(
  combat: FleetCombatService,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  status: HTMLElement
): void {
  const current = combat.getSnapshot();
  const scale = Math.min(canvas.width / current.arena.width, canvas.height / current.arena.height);
  const xOffset = (canvas.width - current.arena.width * scale) / 2;
  const yOffset = (canvas.height - current.arena.height * scale) / 2;
  const x = (value: number): number => value * scale + xOffset;
  const y = (value: number): number => value * scale + yOffset;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#1b3643';
  context.strokeRect(x(0), y(0), current.arena.width * scale, current.arena.height * scale);
  for (const rock of current.arena.obstacles ?? []) {
    context.strokeStyle = '#4a575e';
    context.beginPath();
    context.arc(
      x(rock.position.x),
      y(rock.position.y),
      Math.max(2, rock.radius * scale),
      0,
      Math.PI * 2
    );
    context.stroke();
  }
  for (const shot of current.shots) {
    context.strokeStyle = shot.shieldDamage > 0 ? '#72cce2' : '#f0ad62';
    context.beginPath();
    context.moveTo(x(shot.origin.x), y(shot.origin.y));
    context.lineTo(x(shot.destination.x), y(shot.destination.y));
    context.stroke();
  }
  for (const entry of current.ships) {
    const ship = entry.ship;
    const px = x(ship.position.x);
    const py = y(ship.position.y);
    const color =
      entry.factionId === 'player'
        ? '#72d8a0'
        : entry.factionId === 'pirate-a'
          ? '#d46e65'
          : '#d7b06c';
    context.save();
    context.translate(px, py);
    context.rotate(ship.headingRadians);
    context.fillStyle = ship.hullHp > 0 ? color : '#58616b';
    context.beginPath();
    if (entry.factionId === 'security') {
      context.arc(0, 0, 8, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#bca65c';
      context.lineWidth = 1.5;
      context.stroke();
    } else {
      context.moveTo(11, 0);
      context.lineTo(-8, -7);
      context.lineTo(-5, 0);
      context.lineTo(-8, 7);
      context.closePath();
      context.fill();
    }
    context.restore();
    context.font = '12px monospace';
    context.fillStyle = '#d9e0e3';
    context.fillText(ship.name, px + 12, py - 10);
    context.fillText(
      'S ' + Math.ceil(ship.shieldHp) + ' / H ' + Math.ceil(ship.hullHp),
      px + 12,
      py + 6
    );
  }
  status.textContent =
    'Simulationszeit: ' +
    current.elapsedSeconds.toFixed(1) +
    ' s · ' +
    current.ships.filter((entry) => entry.ship.hullHp > 0).length +
    ' / ' +
    current.ships.length +
    ' Schiffe intakt · Gefechte: ' +
    current.engagements
      .map((entry) => (entry.kind === 'fleet' ? 'Fleet (' + entry.memberIds.length + ')' : '1vs1'))
      .join(', ') +
    ' · Wartend: ' +
    current.pendingArrivals.map((entry) => entry.id + ' (+' + entry.atSeconds + ' s)').join(', ') +
    (current.arrivedShipIds.length ? ' · Eingetroffen: ' + current.arrivedShipIds.join(', ') : '');
}

/**
 * Minimal instrumentation for the first 2vs1 test. This is intentionally
 * not the finished campaign combat renderer.
 */
export function createFleetCombatTestPanel(
  root: HTMLElement,
  combat: FleetCombatService,
  onReturn: () => void
): { destroy(): void } {
  const shell = document.createElement('section');
  shell.className = 'harrow-duel harrow-fleet';
  const heading = document.createElement('h1');
  heading.textContent = 'FLEETCOMBAT · 2vs1 PROTOTYP';
  const explanation = document.createElement('p');
  explanation.textContent =
    'Gemeinsame Welt, Bewegung und direkte Treffer. KI, Projektile, Minen, Rammen und Traktorwürfe sind noch nicht vollständig integriert.';
  const returnButton = document.createElement('button');
  returnButton.textContent = 'Zurück zur FleetCombat-Konfiguration';
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 650;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.maxWidth = '1100px';
  canvas.style.background = '#03070c';
  canvas.style.border = '1px solid #5c6b76';
  const status = document.createElement('p');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('FleetCombat test requires Canvas 2D');
  shell.append(heading, explanation, returnButton, canvas, status);
  root.replaceChildren(shell);
  let frame = 0;
  let destroyed = false;
  let previous = performance.now();
  returnButton.addEventListener('click', onReturn);

  function tick(now: number): void {
    if (destroyed || !context) return;
    combat.tick(Math.min((now - previous) / 1000, 0.08));
    previous = now;
    renderFleetCanvas(combat, canvas, context, status);
    frame = requestAnimationFrame(tick);
  }
  renderFleetCanvas(combat, canvas, context, status);
  frame = requestAnimationFrame(tick);
  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      shell.remove();
    },
  };
}
