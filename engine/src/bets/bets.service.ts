import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bet, BetLeg, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BetsSummary, LogBetDto, SettleBetDto } from './dto';

type BetWithLegs = Bet & { legs: BetLeg[] };

@Injectable()
export class BetsService {
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.currency = config.get('CURRENCY') ?? 'TZS';
  }

  async log(dto: LogBetDto): Promise<BetWithLegs> {
    if (!dto.legs?.length) {
      throw new BadRequestException('A bet needs at least one leg');
    }
    return this.prisma.bet.create({
      data: {
        home: dto.home,
        away: dto.away,
        league: dto.league,
        market: dto.market,
        kickoff: new Date(dto.kickoff),
        profitPct: dto.profitPct,
        totalStake: dto.totalStake,
        note: dto.note,
        legs: {
          create: dto.legs.map((leg) => ({
            bookmaker: leg.bookmaker,
            outcome: leg.outcome,
            odds: leg.odds,
            stake: leg.stake,
          })),
        },
      },
      include: { legs: true },
    });
  }

  async list(): Promise<BetWithLegs[]> {
    return this.prisma.bet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { legs: true },
    });
  }

  /**
   * Settle a bet. For an arb, exactly one leg wins; realized P&L is that
   * leg's payout minus the total staked across all legs. Settling lets us
   * track *actual* results — including when a leg got rejected/limited and
   * the "guaranteed" profit didn't fully materialize.
   */
  async settle(id: string, dto: SettleBetDto): Promise<BetWithLegs> {
    const bet = await this.prisma.bet.findUnique({ where: { id }, include: { legs: true } });
    if (!bet) throw new NotFoundException(`Bet ${id} not found`);

    if (dto.void) {
      return this.update(id, { status: 'VOID', realizedPnl: 0, settledAt: new Date() });
    }

    if (!dto.winningOutcome) {
      throw new BadRequestException('winningOutcome is required to settle (or pass void:true)');
    }
    const winning = bet.legs.find((l) => l.outcome === dto.winningOutcome);
    if (!winning) {
      throw new BadRequestException(
        `No leg with outcome "${dto.winningOutcome}" on this bet (legs: ${bet.legs
          .map((l) => l.outcome)
          .join(', ')})`,
      );
    }

    const totalStaked = bet.legs.reduce((sum, l) => sum + l.stake, 0);
    const realizedPnl = winning.stake * winning.odds - totalStaked;

    return this.update(id, {
      status: 'SETTLED',
      winningOutcome: dto.winningOutcome,
      realizedPnl,
      settledAt: new Date(),
    });
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.bet.delete({ where: { id } });
    } catch {
      throw new NotFoundException(`Bet ${id} not found`);
    }
  }

  async summary(): Promise<BetsSummary> {
    const bets = await this.prisma.bet.findMany({ include: { legs: true } });
    let openCount = 0;
    let settledCount = 0;
    let stakedOutstanding = 0;
    let realizedPnl = 0;
    let settledTurnover = 0;

    for (const bet of bets) {
      const staked = bet.legs.reduce((sum, l) => sum + l.stake, 0);
      if (bet.status === 'OPEN') {
        openCount++;
        stakedOutstanding += staked;
      } else if (bet.status === 'SETTLED') {
        settledCount++;
        realizedPnl += bet.realizedPnl ?? 0;
        settledTurnover += staked;
      }
    }

    return {
      currency: this.currency,
      openCount,
      settledCount,
      stakedOutstanding,
      realizedPnl,
      settledTurnover,
      roiPct: settledTurnover > 0 ? (realizedPnl / settledTurnover) * 100 : 0,
    };
  }

  private update(id: string, data: Prisma.BetUpdateInput): Promise<BetWithLegs> {
    return this.prisma.bet.update({ where: { id }, data, include: { legs: true } });
  }
}
