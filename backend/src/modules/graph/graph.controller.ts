import { Controller } from '@nestjs/common';

/**
 * Graph controller - skill visualization is handled client-side via D3 force
 * layout using pre-computed positions stored in document.parsedJson.graphLayout.
 */
@Controller('graph')
export class GraphController {}
