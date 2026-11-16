import {
  CAREER_SAVE_SECTIONS,
  validateCareerSnapshot,
  type CareerJson,
  type CareerSaveSection,
  type CareerSnapshot,
} from './career-save-contract';

export interface CareerStagedAuthority<T = unknown> {
  readonly value: T;
  /** Releases only resources allocated for this candidate, never the current session. */
  readonly discard?: () => void;
}

export interface CareerSectionBuilder {
  readonly section: CareerSaveSection;
  readonly stage: (
    value: CareerJson,
    preceding: Readonly<Partial<Record<CareerSaveSection, unknown>>>
  ) => CareerStagedAuthority;
}

export interface PreparedCareerSession {
  readonly sections: Readonly<Record<CareerSaveSection, unknown>>;
  discard(): void;
}

/** A complete dependency-ordered staging plan, with one authority for every save section. */
export function prepareCareerAuthorities(
  candidate: CareerSnapshot,
  builders: readonly CareerSectionBuilder[],
  verify: (sections: Readonly<Record<CareerSaveSection, unknown>>) => void
): PreparedCareerSession {
  const snapshot = validateCareerSnapshot(candidate);
  const required = new Set<string>(CAREER_SAVE_SECTIONS);
  const configured = new Set<string>();
  for (const builder of builders) {
    if (!required.has(builder.section) || configured.has(builder.section)) {
      throw new Error('Invalid or duplicated career section builder');
    }
    configured.add(builder.section);
  }
  if (configured.size !== required.size) {
    throw new Error('Incomplete career section builder plan');
  }
  const staged: Partial<Record<CareerSaveSection, unknown>> = {};
  const cleanup: (() => void)[] = [];
  let discarded = false;
  const discard = (): void => {
    if (discarded) return;
    discarded = true;
    for (const release of cleanup.reverse()) {
      try {
        release();
      } catch {
        // An abandoned candidate must never replace the active session.
      }
    }
  };
  try {
    for (const builder of builders) {
      const part = builder.stage(snapshot.sections[builder.section], staged);
      if (!part || part.value === undefined) {
        throw new Error('Career section builder returned no authority');
      }
      staged[builder.section] = part.value;
      if (part.discard) cleanup.push(part.discard);
    }
    const authorities = staged as Record<CareerSaveSection, unknown>;
    verify(authorities);
    return { sections: authorities, discard };
  } catch (error) {
    discard();
    throw error;
  }
}

export interface CareerSessionSlot<T> {
  current(): T;
  /** Replaces a single pointer only after the complete detached candidate is verified. */
  install(next: T): T;
}

/** The only state change in install is the active-session pointer assignment. */
export function createCareerSessionSlot<T>(initial: T): CareerSessionSlot<T> {
  let active = initial;
  return {
    current: () => active,
    install(next) {
      const previous = active;
      active = next;
      return previous;
    },
  };
}
