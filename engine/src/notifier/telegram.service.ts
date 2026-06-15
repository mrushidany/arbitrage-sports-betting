import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbOpportunity } from '../common/types';

const BOOK_LABELS: Record<string, string> = {
  sportybet: 'SportyBet',
  helabet: 'Helabet',
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;
  private readonly currency: string;

  constructor(config: ConfigService) {
    this.token = config.get('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get('TELEGRAM_CHAT_ID');
    this.currency = config.get('CURRENCY') ?? 'TZS';
  }

  get configured(): boolean {
    return Boolean(this.token && this.chatId);
  }

  async sendArb(arb: ArbOpportunity): Promise<void> {
    // Don't alert for arbs that are losses after withholding tax.
    if (arb.taxRate > 0 && arb.afterTaxProfitPct <= 0) {
      this.logger.log(
        `Skipping Telegram alert — ${arb.profitPct.toFixed(2)}% pre-tax but ${arb.afterTaxProfitPct.toFixed(2)}% after ${(arb.taxRate * 100).toFixed(0)}% tax`,
      );
      return;
    }
    const text = this.format(arb);
    if (!this.configured) {
      this.logger.log(`(Telegram not configured) Would send:\n${text.replace(/<[^>]+>/g, '')}`);
      return;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Telegram sendMessage failed: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Telegram sendMessage error: ${(err as Error).message}`);
    }
  }

  private format(arb: ArbOpportunity): string {
    const kickoff = new Date(arb.event.startTime).toLocaleString('en-GB', {
      timeZone: 'Africa/Dar_es_Salaam',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const flag = arb.suspicious ? '⚠️ SUSPICIOUS (verify teams/odds!) ' : '';
    const taxLabel = arb.taxRate > 0 ? ` · ${(arb.taxRate * 100).toFixed(0)}% tax` : '';
    const lines = [
      `⚽ ${flag}<b>ARB ${arb.afterTaxProfitPct.toFixed(2)}% after tax</b> — ${esc(arb.event.home)} vs ${esc(arb.event.away)}`,
      `🏆 ${esc(arb.event.league)} · kickoff ${kickoff} EAT`,
      `📊 Market: <b>${arb.market}</b>${taxLabel} · pre-tax ${arb.profitPct.toFixed(2)}%`,
      '',
      ...arb.legs.map(
        (leg) =>
          `• <b>${leg.outcome}</b> @ ${leg.odds.toFixed(2)} on <b>${BOOK_LABELS[leg.bookmaker] ?? leg.bookmaker}</b> → stake ${fmt(leg.stake)} ${this.currency}`,
      ),
      '',
      `💰 Total ${fmt(arb.totalStake)} ${this.currency} → after-tax profit ≈ <b>${fmt(Math.round(arb.afterTaxGuaranteedProfit))} ${this.currency}</b>`,
    ];
    if (arb.note) lines.push(`ℹ️ ${esc(arb.note)}`);
    return lines.join('\n');
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
