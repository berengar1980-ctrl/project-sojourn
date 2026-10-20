import type {
  CampaignContext,
  CampaignDefinition,
  CampaignEvent,
  CampaignJournalView,
  CampaignProgress,
} from '../../core/campaign-types';
import type { WorldLocation, WorldMap } from '../../core/world-types';

const CAMPAIGN_ID = 'silent-signal';
const BEACON_ID = 'silent-beacon';
const SYSTEM_ID = 'silent-reach';
const ENTRY_ID = 'silent-entry';
const SHIP_ID = 'silent-laboratory';
const EXIT_ID = 'silent-exit';

function missionLocation(id: string, name: string, x: number, y: number): WorldLocation {
  return {
    id,
    name,
    kind: 'station',
    position: { x, y },
    radius: 15,
    description: 'Verlassene Navigationssignatur. Keine regulären Hafendienste.',
    activities: { missions: true },
    dangerLevel: 1,
  };
}

const beacon: WorldLocation = {
  ...missionLocation(BEACON_ID, 'Verstummtes Signal', 3210, 3660),
  description: 'Schwacher Notruf ohne Kennung, nahe den Handelsrouten von Haven.',
};

const reach: WorldMap = {
  id: SYSTEM_ID,
  name: 'Stilles Grenzsystem',
  width: 1500,
  height: 1100,
  startLocationId: ENTRY_ID,
  star: {
    id: 'silent-star',
    name: 'Verblasster Stern',
    position: { x: 750, y: 500 },
    radius: 55,
    colorCore: '#b8c8d4',
    colorCorona: '#526d87',
  },
  locations: [
    missionLocation(ENTRY_ID, 'Eintrittspunkt', 190, 810),
    missionLocation(SHIP_ID, 'Forschungsschiff Elara', 1200, 360),
    missionLocation(EXIT_ID, 'Rückkehrkorridor', 280, 280),
  ],
  regions: [
    {
      id: 'silent-field',
      name: 'Stille Zone',
      center: { x: 950, y: 410 },
      radius: 260,
      dangerLevel: 2,
    },
  ],
};

function state(progress: CampaignProgress): string {
  return typeof progress.data.stage === 'string' ? progress.data.stage : 'unknown';
}

function choice(
  event: CampaignEvent,
  dialogueId: string,
  choiceId: string,
  location: string
): boolean {
  return (
    event.type === 'dialogue.choice' &&
    event.campaignId === CAMPAIGN_ID &&
    event.dialogueId === dialogueId &&
    event.choiceId === choiceId &&
    event.locationId === location
  );
}

function applyOnce(
  ctx: CampaignContext,
  id: string,
  action: Parameters<CampaignContext['applyAction']>[1]
): boolean {
  return ctx.applyAction(id, action) !== 'rejected';
}

function launchMission(ctx: CampaignContext): void {
  if (!ctx.start()) return;
  if (!applyOnce(ctx, 'signal.add', { type: 'world.location.add', location: beacon })) return;
  ctx.set('stage', 'beacon');
}

function decide(ctx: CampaignContext, event: CampaignEvent): void {
  if (choice(event, 'crew', 'rescue', SHIP_ID)) {
    ctx.set('ending', 'rescue');
    ctx.set('stage', 'return');
  } else if (choice(event, 'crew', 'quarantine', SHIP_ID)) {
    ctx.set('ending', 'quarantine');
    ctx.set('stage', 'return');
  }
}

function finishMission(ctx: CampaignContext): void {
  const rescued = ctx.get('ending') === 'rescue';
  const credits = rescued ? 220 : 300;
  const factionId = rescued ? 'free_traders' : 'terran_directorate';
  if (!applyOnce(ctx, 'reward.credits', { type: 'credits.grant', amount: credits })) return;
  if (
    !applyOnce(ctx, 'reward.reputation', {
      type: 'reputation.change',
      factionId,
      delta: 6,
    })
  )
    return;
  ctx.complete(rescued ? 'crew_rescued' : 'ship_quarantined');
}

function handleMissionReturn(event: CampaignEvent, ctx: CampaignContext, stage: string): void {
  if (stage === 'return' && choice(event, 'exit', 'home', EXIT_ID)) {
    applyOnce(ctx, 'system.return', { type: 'world.system.return' });
  } else if (
    stage === 'return' &&
    event.type === 'location.arrived' &&
    event.locationId === BEACON_ID
  ) {
    ctx.set('stage', 'report');
  } else if (stage === 'report' && choice(event, 'report', 'deliver', BEACON_ID)) {
    finishMission(ctx);
  }
}

function onMissionEvent(event: CampaignEvent, ctx: CampaignContext): void {
  if (event.type === 'game.initialized' && ctx.status() === 'inactive') {
    launchMission(ctx);
    return;
  }
  if (ctx.status() !== 'active') return;
  const stage = ctx.get('stage');
  if (stage === 'beacon' && choice(event, 'beacon', 'decode', BEACON_ID)) {
    if (
      !applyOnce(ctx, 'system.add', {
        type: 'world.system.add',
        map: reach,
        entryLocationId: ENTRY_ID,
        exitLocationId: EXIT_ID,
      })
    )
      return;
    ctx.set('stage', 'gate');
  } else if (stage === 'gate' && choice(event, 'gate', 'enter', BEACON_ID)) {
    if (applyOnce(ctx, 'system.enter', { type: 'world.system.enter', systemId: SYSTEM_ID })) {
      ctx.set('stage', 'search');
    }
  } else if (
    stage === 'search' &&
    event.type === 'location.arrived' &&
    event.locationId === SHIP_ID
  ) {
    ctx.set('stage', 'decision');
  } else if (stage === 'decision') {
    decide(ctx, event);
  } else if (typeof stage === 'string') {
    handleMissionReturn(event, ctx, stage);
  }
}

function makeDialogue(
  id: string,
  speaker: string,
  text: string,
  choices: readonly { readonly id: string; readonly label: string }[]
): CampaignJournalView['dialogue'] {
  return { id, speaker, text, choices };
}

function beaconJournal(at: string | null): CampaignJournalView {
  return {
    chapter: 'I · DAS SIGNAL',
    objective: 'Untersuche den unbekannten Sender nahe Haven',
    detail: 'Ein beschädigter Notruf nennt ein verschollenes Forschungsschiff.',
    targetLocationId: BEACON_ID,
    ...(at === BEACON_ID
      ? {
          dialogue: makeDialogue(
            'beacon',
            'Archivierte Vox-Aufnahme',
            '»Hier Elara. Wir haben etwas geborgen. Unser Navigator weigert sich weiterzufliegen. Koordinaten folgen.«',
            [{ id: 'decode', label: 'Koordinaten entschlüsseln' }]
          ),
        }
      : {}),
  };
}

function gateJournal(at: string | null): CampaignJournalView {
  return {
    chapter: 'II · DER SPRUNG',
    objective: 'Folge den entschlüsselten Koordinaten',
    detail: 'Ein verborgenes Sternensystem liegt jenseits der bekannten Routen.',
    targetLocationId: BEACON_ID,
    ...(at === BEACON_ID
      ? {
          dialogue: makeDialogue(
            'gate',
            'Navigation',
            '»Der Korridor ist instabil. Wir können den Sprung jetzt auslösen.«',
            [{ id: 'enter', label: 'Sprung einleiten' }]
          ),
        }
      : {}),
  };
}

function decisionJournal(at: string | null): CampaignJournalView {
  return {
    chapter: 'III · DIE ENTSCHEIDUNG',
    objective: 'Entscheide über die Besatzung der Elara',
    detail: 'Eine verschlossene Schleuse und ein unvollständiges medizinisches Protokoll.',
    targetLocationId: SHIP_ID,
    ...(at === SHIP_ID
      ? {
          dialogue: makeDialogue(
            'crew',
            'Kommandantin der Elara',
            '»Wir sind noch am Leben. Aber unser Frachtraum darf nie wieder geöffnet werden. Holt uns heraus – oder versiegelt alles.«',
            [
              { id: 'rescue', label: 'Besatzung evakuieren' },
              { id: 'quarantine', label: 'Schiff unter Quarantäne stellen' },
            ]
          ),
        }
      : {}),
  };
}

function reportJournal(at: string | null): CampaignJournalView {
  return {
    chapter: 'III · DER BERICHT',
    objective: 'Übermittle deinen Abschlussbericht',
    detail: 'Die Auftraggeber warten beim ursprünglichen Notsignal.',
    targetLocationId: BEACON_ID,
    ...(at === BEACON_ID
      ? {
          dialogue: makeDialogue(
            'report',
            'Direktoratsarchiv',
            '»Wir haben den Telemetriebericht empfangen. Bestätigen Sie die Übergabe.«',
            [{ id: 'deliver', label: 'Bericht übermitteln und Belohnung erhalten' }]
          ),
        }
      : {}),
  };
}

function journal(progress: CampaignProgress, at: string | null): CampaignJournalView {
  if (progress.status === 'completed') {
    return {
      chapter: 'ABSCHLUSS',
      objective: 'Auftrag abgeschlossen',
      detail:
        progress.outcome === 'crew_rescued'
          ? 'Die Besatzung wurde evakuiert. Der Vorfall ist protokolliert.'
          : 'Das Forschungsschiff wurde unter Quarantäne gestellt.',
    };
  }
  switch (state(progress)) {
    case 'beacon':
      return beaconJournal(at);
    case 'gate':
      return gateJournal(at);
    case 'search':
      return {
        chapter: 'II · DER SPRUNG',
        objective: 'Erreiche das Forschungsschiff Elara',
        detail: 'Die Sensoren zeigen ein einzelnes Schiff in der stillen Zone.',
        targetLocationId: SHIP_ID,
      };
    case 'decision':
      return decisionJournal(at);
    case 'return':
      return {
        chapter: 'III · DIE RÜCKKEHR',
        objective: 'Reise über den Rückkehrkorridor zum Ausgangssystem',
        detail:
          'Erreiche den Rückkehrkorridor und wähle ihn erneut aus, sobald du angekommen bist.',
        targetLocationId: EXIT_ID,
        ...(at === EXIT_ID
          ? {
              dialogue: makeDialogue(
                'exit',
                'Navigatorin',
                '»Rückkehrkorridor stabilisiert. Bereit zum Übergang.«',
                [{ id: 'home', label: 'Zum Ausgangssystem zurückkehren' }]
              ),
            }
          : {}),
      };
    default:
      return reportJournal(at);
  }
}

export const silentSignalCampaign: CampaignDefinition = {
  id: CAMPAIGN_ID,
  title: 'Das verstummte Signal',
  version: 1,
  category: 'core',
  onEvent: onMissionEvent,
  present: journal,
};
