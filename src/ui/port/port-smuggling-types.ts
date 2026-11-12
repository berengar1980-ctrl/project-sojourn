export interface SmugglingPortView {
  readonly day: number;
  readonly known: boolean;
  readonly installed: boolean;
  readonly hiddenCapacity: number;
  readonly hiddenUsed: number;
  readonly normalPenalty: number;
  readonly concealment: number;
  readonly price: number;
  readonly intelPrice: number;
  readonly intelDay: number;
  readonly suspicion: number;
  readonly protectionFaction: 'pirates' | 'pirates2' | undefined;
  readonly atPirateBase: boolean;
  readonly pirateFaction: 'pirates' | 'pirates2' | null;
  readonly hiddenRows: readonly {
    readonly id: string;
    readonly name: string;
    readonly visible: number;
    readonly hidden: number;
  }[];
}
