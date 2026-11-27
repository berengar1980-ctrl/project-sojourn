import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { advanceAutopilotRoute } from './local-space-autopilot';
import {
  fieldTrafficObstacles,
  reviewFieldTrafficRoute,
} from '../navigation/field-traffic-obstacles';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import type { ShieldWorldGeometry } from './local-space-collision';
import { planPointRoute } from './local-space-navigation';
import { crewAvoidsAsteroid, findRouteAsteroidHazard } from './local-space-hazard-avoidance';

export class LocalSpaceAutopilotHazards {
  private elapsed = 0;
  private readonly checked = new Set<string>();

  constructor(
    private readonly instance: LocalSpaceInstance,
    private readonly shield: ShieldWorldGeometry,
    private readonly speed: number,
    private readonly crew: { readonly piloting: number; readonly sensors: number },
    private readonly random: () => number,
    private readonly notice: (message: string) => void,
    private readonly additionalObstacles: () => readonly LocalAsteroid[] = () => [],
    private readonly getTraffic: () => readonly FieldRouteObstacle[] = () =>
      fieldTrafficObstacles(instance, 'player')
  ) {}

  advanceRoute(...args: Parameters<typeof advanceAutopilotRoute>) {
    const [ship, route, index, speed, dt, brake, reverse, turnRate] = args;
    return advanceAutopilotRoute(ship, route, index, speed, dt, brake, reverse, turnRate, {
      obstacles: this.getTraffic(),
      solids: () =>
        [...this.instance.asteroids, ...this.additionalObstacles()].filter(
          (rock) => rock.routeBlocking
        ),
      clearance: Math.max(this.shield.radiusX, this.shield.radiusY),
    });
  }

  reset(): void {
    this.elapsed = 0;
    this.checked.clear();
  }

  /** One check per obstacle: recognition by sensors and a separate piloting reaction. */
  review(
    seconds: number,
    route: readonly WorldPoint[],
    index: number,
    excludedId: string | null = null
  ): { readonly route: readonly WorldPoint[]; readonly index: number } {
    this.elapsed += seconds;
    if (this.elapsed < 0.65) return { route, index };
    this.elapsed = 0;
    const clearance = Math.max(this.shield.radiusX, this.shield.radiusY) + 24;
    const traffic = reviewFieldTrafficRoute(
      {
        start: this.instance.ship.position,
        asteroids: [...this.instance.asteroids, ...this.additionalObstacles()].filter(
          (rock) => rock.id !== excludedId
        ),
        clearance,
        width: this.instance.width,
        height: this.instance.height,
      },
      route,
      index,
      this.getTraffic()
    );
    return this.reviewAsteroidHazard(traffic.route, traffic.index, clearance, excludedId);
  }

  private reviewAsteroidHazard(
    route: readonly WorldPoint[],
    index: number,
    clearance: number,
    excludedId: string | null
  ): { readonly route: readonly WorldPoint[]; readonly index: number } {
    const waypoint = route[index];
    if (!waypoint) return { route, index };
    const hazard = findRouteAsteroidHazard(
      this.instance.ship,
      waypoint,
      [...this.instance.asteroids, ...this.additionalObstacles()],
      clearance,
      this.speed,
      excludedId
    );
    if (!hazard || this.checked.has(hazard.asteroid.id)) return { route, index };
    this.checked.add(hazard.asteroid.id);
    if (
      !crewAvoidsAsteroid(this.crew.piloting, this.crew.sensors, hazard.timeToCrossing, this.random)
    ) {
      this.notice('NAV > ASTEROID IM KURS · AUSWEICHREAKTION NICHT RECHTZEITIG');
      return { route, index };
    }
    const projected = [...this.instance.asteroids, ...this.additionalObstacles()].map((asteroid) =>
      asteroid.id === hazard.asteroid.id
        ? { ...asteroid, position: hazard.predictedPosition }
        : asteroid
    );
    const detour = planPointRoute({
      start: this.instance.ship.position,
      target: waypoint,
      asteroids: projected,
      clearance,
      width: this.instance.width,
      height: this.instance.height,
    });
    if (detour.compromised || detour.route.length <= 2) {
      this.notice('NAV > GEFAHR ERKANNT · KEIN SICHERER AUSWEICHKURS');
      return { route, index };
    }
    this.notice('NAV > SENSORIK / STEUERMANN · AUSWEICHKURS BERECHNET');
    return { route: [...detour.route, ...route.slice(index + 1)], index: 1 };
  }
}
