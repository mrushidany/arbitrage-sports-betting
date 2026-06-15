import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BetsService } from './bets.service';
import { LogBetDto, SettleBetDto } from './dto';

@Controller('api/bets')
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Get()
  list() {
    return this.bets.list();
  }

  @Get('summary')
  summary() {
    return this.bets.summary();
  }

  @Post()
  log(@Body() dto: LogBetDto) {
    return this.bets.log(dto);
  }

  @Patch(':id/settle')
  settle(@Param('id') id: string, @Body() dto: SettleBetDto) {
    return this.bets.settle(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.bets.remove(id);
    return { ok: true };
  }
}
