import { Controller } from '@nestjs/common';

/**
 * Graph controller - Neo4j dependency removed.
 * All endpoints that relied on Neo4j (person/position/skill-network graphs,
 * cooccurrence-batch, community-stream) have been removed.
 * Skill visualization is now handled client-side via D3 force layout
 * using pre-computed positions stored in document.parsedJson.graphLayout.
 */
@Controller('graph')
export class GraphController {}
