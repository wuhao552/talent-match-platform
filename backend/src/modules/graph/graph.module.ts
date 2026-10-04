import { Module } from '@nestjs/common';
import { GraphLayoutService } from './graph-layout.service';

@Module({
  providers: [GraphLayoutService],
  exports: [GraphLayoutService],
})
export class GraphModule {}
