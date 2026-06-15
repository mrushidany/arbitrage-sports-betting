import { ArbLeg } from '../common/types';

export interface StakePlan {
  legs: ArbLeg[];
  /** Worst-case profit across outcomes after rounding, in currency units. */
  guaranteedProfit: number;
}

/**
 * Splits a total stake across legs so every outcome returns the same
 * amount: stake_i = total * (1/odds_i) / Σ(1/odds).
 *
 * Stakes are rounded to `roundTo` (default 100, i.e. TZS-friendly) and the
 * guaranteed profit is recomputed as the WORST case after rounding, so the
 * alert never overstates what you'd actually lock in.
 */
export function calculateStakes(
  legs: Omit<ArbLeg, 'stakeFraction' | 'stake'>[],
  totalStake: number,
  roundTo = 100,
): StakePlan {
  const impliedSum = legs.reduce((sum, leg) => sum + 1 / leg.odds, 0);

  const planned: ArbLeg[] = legs.map((leg) => {
    const stakeFraction = 1 / leg.odds / impliedSum;
    const stake = Math.round((totalStake * stakeFraction) / roundTo) * roundTo;
    return { ...leg, stakeFraction, stake };
  });

  const totalStaked = planned.reduce((sum, leg) => sum + leg.stake, 0);
  const guaranteedProfit = Math.min(
    ...planned.map((leg) => leg.stake * leg.odds - totalStaked),
  );

  return { legs: planned, guaranteedProfit };
}
