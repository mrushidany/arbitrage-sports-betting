import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ScannerService } from './scanner/scanner.service';

/**
 * Runs a single scan cycle and prints results — for testing the pipeline
 * without starting the daemon. Usage: npm run scan:once
 */
async function main() {
  process.env.SCANNER_AUTOSTART = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const scanner = app.get(ScannerService);

  const arbs = await scanner.scan();
  if (arbs.length === 0) {
    console.log('\nNo arbitrage opportunities this cycle (normal — arbs appear in bursts).');
  } else {
    console.log(`\n=== ${arbs.length} ARBITRAGE OPPORTUNITIES ===`);
    for (const arb of arbs) {
      console.log(
        `\n${arb.suspicious ? '⚠️ SUSPICIOUS ' : ''}${arb.profitPct.toFixed(2)}% — ${arb.event.home} vs ${arb.event.away} (${arb.market})`,
      );
      for (const leg of arb.legs) {
        console.log(`   ${leg.outcome.padEnd(6)} @ ${leg.odds.toFixed(2).padStart(6)} on ${leg.bookmaker.padEnd(10)} stake ${leg.stake.toLocaleString()}`);
      }
      console.log(`   guaranteed profit ≈ ${Math.round(arb.guaranteedProfit).toLocaleString()} on ${arb.totalStake.toLocaleString()} total`);
    }
  }
  await app.close();
}

void main();
