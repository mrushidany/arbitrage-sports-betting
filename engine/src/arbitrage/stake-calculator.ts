import { ArbLeg } from '../common/types';

export interface StakePlan {
  legs: ArbLeg[];
  /** Worst-case profit across outcomes after rounding (pre-tax), in currency units. */
  guaranteedProfit: number;
  /** Worst-case profit after withholding tax and rounding. Negative = loss. */
  afterTaxGuaranteedProfit: number;
}

/**
 * Splits a total stake across legs so every outcome returns the same
 * after-tax amount.
 *
 * With a withholding tax rate T on net winnings, the effective after-tax
 * return when leg i wins is:
 *   stake_i × (odds_i × (1−T) + T)   ← effective odds = gross odds adjusted for tax
 *
 * Stakes are therefore sized proportional to 1/effective_odds (not 1/gross_odds),
 * which equalises the after-tax payout across all outcomes.
 *
 * With T=0 the behaviour is identical to the pre-tax formula.
 * Stakes are rounded to `roundTo` (default 100, TZS-friendly).
 */
export function calculateStakes(
  legs: Omit<ArbLeg, 'stakeFraction' | 'stake'>[],
  totalStake: number,
  taxRate = 0,
  roundTo = 100,
): StakePlan {
  // Effective odds after withholding tax: o_eff = o × (1-T) + T
  const effOdds = legs.map((l) => l.odds * (1 - taxRate) + taxRate);
  const impliedSumEff = effOdds.reduce((s, o) => s + 1 / o, 0);

  const planned: ArbLeg[] = legs.map((leg, i) => {
    const stakeFraction = 1 / effOdds[i] / impliedSumEff;
    const stake = Math.round((totalStake * stakeFraction) / roundTo) * roundTo;
    return { ...leg, stakeFraction, stake };
  });

  const totalStaked = planned.reduce((s, l) => s + l.stake, 0);

  // Pre-tax guaranteed profit (gross return from winning leg − total staked)
  const guaranteedProfit = Math.min(
    ...planned.map((l) => l.stake * l.odds - totalStaked),
  );

  // After-tax guaranteed profit (effective return from winning leg − total staked)
  const afterTaxGuaranteedProfit = Math.min(
    ...planned.map((l, i) => l.stake * effOdds[i] - totalStaked),
  );

  return { legs: planned, guaranteedProfit, afterTaxGuaranteedProfit };
}
