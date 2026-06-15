import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiController } from './api/api.controller';
import { ArbitrageService } from './arbitrage/arbitrage.service';
import { BetsController } from './bets/bets.controller';
import { BetsService } from './bets/bets.service';
import { BOOKMAKER_ADAPTERS } from './bookmakers/bookmaker-adapter';
import { HelabetAdapter } from './bookmakers/helabet.adapter';
import { SportybetAdapter } from './bookmakers/sportybet.adapter';
import { EventMatcherService } from './matching/event-matcher.service';
import { TelegramService } from './notifier/telegram.service';
import { PrismaService } from './prisma/prisma.service';
import { ScannerService } from './scanner/scanner.service';
import { SnapshotService } from './snapshot/snapshot.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [ApiController, BetsController],
  providers: [
    SportybetAdapter,
    HelabetAdapter,
    {
      provide: BOOKMAKER_ADAPTERS,
      useFactory: (...adapters) => adapters,
      inject: [SportybetAdapter, HelabetAdapter],
    },
    EventMatcherService,
    ArbitrageService,
    TelegramService,
    SnapshotService,
    ScannerService,
    PrismaService,
    BetsService,
  ],
})
export class AppModule {}
