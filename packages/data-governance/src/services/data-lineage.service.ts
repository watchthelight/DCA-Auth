import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export class DataLineageService extends EventEmitter {
  private config: any;
  private prisma: PrismaClient;
  private lineageGraph: Map<string, any> = new Map();

  constructor(config: any, prisma: PrismaClient) {
    super();
    this.config = config;
    this.prisma = prisma;
  }

  async trace(assetIdOrTable: string): Promise<any> {
    const lineage = {
      sources: [] as any[],
      consumers: [] as any[],
      dependencies: [] as string[]
    };

    try {
      // Get lineage from graph
      const node = this.lineageGraph.get(assetIdOrTable);
      if (node) {
        lineage.sources = node.sources || [];
        lineage.consumers = node.consumers || [];
        lineage.dependencies = node.dependencies || [];
      }

      // Try to infer lineage from database relationships
      const inferredLineage = await this.inferLineage(assetIdOrTable);
      lineage.sources.push(...inferredLineage.sources);
      lineage.consumers.push(...inferredLineage.consumers);

      return lineage;
    } catch (error) {
      console.error('Error tracing lineage:', error);
      return lineage;
    }
  }

  private async inferLineage(tableName: string): Promise<any> {
    const sources: any[] = [];
    const consumers: any[] = [];

    // Common patterns for lineage inference
    const sourcePatterns = {
      'licenses': ['users', 'products', 'organizations'],
      'activations': ['licenses', 'machines'],
      'audit_logs': ['users', 'licenses', 'activations'],
      'invoices': ['users', 'licenses', 'payments'],
      'reports': ['*'] // Reports consume from all tables
    };

    const consumerPatterns = {
      'users': ['licenses', 'audit_logs', 'invoices'],
      'licenses': ['activations', 'audit_logs', 'invoices'],
      'products': ['licenses'],
      'organizations': ['users', 'licenses']
    };

    // Get sources
    if (sourcePatterns[tableName]) {
      for (const source of sourcePatterns[tableName]) {
        sources.push({
          id: crypto.randomUUID(),
          name: source,
          type: 'table',
          transformations: [`Extract from ${source}`, `Load to ${tableName}`]
        });
      }
    }

    // Get consumers
    if (consumerPatterns[tableName]) {
      for (const consumer of consumerPatterns[tableName]) {
        consumers.push({
          id: crypto.randomUUID(),
          name: consumer,
          type: 'table',
          usage: `References ${tableName} data`
        });
      }
    }

    return { sources, consumers };
  }

  async recordFlow(source: string, destination: string, transformation?: string): Promise<void> {
    const flowId = crypto.randomUUID();

    // Update source node
    if (!this.lineageGraph.has(source)) {
      this.lineageGraph.set(source, {
        id: source,
        sources: [],
        consumers: [],
        dependencies: []
      });
    }

    const sourceNode = this.lineageGraph.get(source)!;
    sourceNode.consumers.push({
      id: flowId,
      name: destination,
      type: 'flow',
      transformation
    });

    // Update destination node
    if (!this.lineageGraph.has(destination)) {
      this.lineageGraph.set(destination, {
        id: destination,
        sources: [],
        consumers: [],
        dependencies: []
      });
    }

    const destNode = this.lineageGraph.get(destination)!;
    destNode.sources.push({
      id: flowId,
      name: source,
      type: 'flow',
      transformation
    });

    // Store in database
    try {
      await this.prisma.data_lineage.create({
        data: {
          flow_id: flowId,
          source_asset: source,
          destination_asset: destination,
          transformation: transformation || '',
          created_at: new Date()
        }
      });
    } catch (error) {
      console.log('Failed to store lineage in database:', error);
    }

    this.emit('flow:recorded', { source, destination, transformation });
  }

  async analyzeImpact(assetId: string): Promise<{
    impactedAssets: string[];
    downstreamEffects: Array<{
      asset: string;
      impact: 'low' | 'medium' | 'high';
      description: string;
    }>;
  }> {
    const impactedAssets: Set<string> = new Set();
    const downstreamEffects: any[] = [];

    // Traverse the lineage graph to find all downstream assets
    const queue = [assetId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = this.lineageGraph.get(current);
      if (node) {
        for (const consumer of node.consumers || []) {
          impactedAssets.add(consumer.name);
          queue.push(consumer.name);

          // Assess impact level
          const impact = this.assessImpactLevel(current, consumer.name);
          downstreamEffects.push({
            asset: consumer.name,
            impact,
            description: `Changes to ${current} will affect ${consumer.name} through ${consumer.transformation || 'direct dependency'}`
          });
        }
      }
    }

    return {
      impactedAssets: Array.from(impactedAssets),
      downstreamEffects
    };
  }

  private assessImpactLevel(source: string, destination: string): 'low' | 'medium' | 'high' {
    // Critical dependencies
    const criticalPairs = {
      'users': ['licenses', 'authentication'],
      'licenses': ['activations', 'billing'],
      'products': ['licenses']
    };

    if (criticalPairs[source]?.includes(destination)) {
      return 'high';
    }

    // Audit and reporting dependencies
    if (destination.includes('audit') || destination.includes('report')) {
      return 'low';
    }

    return 'medium';
  }

  async visualizeLineage(assetId: string): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      level: number;
    }>;
    edges: Array<{
      source: string;
      target: string;
      label?: string;
    }>;
  }> {
    const nodes: any[] = [];
    const edges: any[] = [];
    const visited = new Set<string>();

    // BFS to build visualization
    const queue = [{ id: assetId, level: 0 }];

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      nodes.push({
        id,
        label: id,
        type: 'asset',
        level
      });

      const node = this.lineageGraph.get(id);
      if (node) {
        // Add sources
        for (const source of node.sources || []) {
          if (!visited.has(source.name)) {
            queue.push({ id: source.name, level: level - 1 });
            edges.push({
              source: source.name,
              target: id,
              label: source.transformation
            });
          }
        }

        // Add consumers
        for (const consumer of node.consumers || []) {
          if (!visited.has(consumer.name)) {
            queue.push({ id: consumer.name, level: level + 1 });
            edges.push({
              source: id,
              target: consumer.name,
              label: consumer.transformation
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  async getDataProvenance(assetId: string): Promise<{
    origin: string;
    transformations: Array<{
      step: number;
      operation: string;
      timestamp?: Date;
      actor?: string;
    }>;
    currentState: any;
  }> {
    const provenance = {
      origin: '',
      transformations: [] as any[],
      currentState: {}
    };

    // Trace back to origin
    let current = assetId;
    let step = 0;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current)) break;
      visited.add(current);

      const node = this.lineageGraph.get(current);
      if (node && node.sources && node.sources.length > 0) {
        const source = node.sources[0];
        provenance.transformations.push({
          step: step++,
          operation: source.transformation || `Load from ${source.name}`,
          timestamp: new Date()
        });

        if (!provenance.origin) {
          provenance.origin = source.name;
        }

        current = source.name;
      } else {
        break;
      }
    }

    provenance.transformations.reverse();

    return provenance;
  }

  getLineageGraph(): Map<string, any> {
    return this.lineageGraph;
  }

  async exportLineage(format: 'json' | 'dot' | 'cypher' = 'json'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(
          Array.from(this.lineageGraph.entries()),
          null,
          2
        );

      case 'dot':
        return this.exportToDot();

      case 'cypher':
        return this.exportToCypher();

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private exportToDot(): string {
    let dot = 'digraph DataLineage {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n';

    for (const [id, node] of this.lineageGraph) {
      dot += `  "${id}";\n`;

      for (const consumer of node.consumers || []) {
        dot += `  "${id}" -> "${consumer.name}"`;
        if (consumer.transformation) {
          dot += ` [label="${consumer.transformation}"]`;
        }
        dot += ';\n';
      }
    }

    dot += '}\n';
    return dot;
  }

  private exportToCypher(): string {
    let cypher = '// Create nodes\n';

    for (const [id, node] of this.lineageGraph) {
      cypher += `CREATE (${id.replace(/[^a-zA-Z0-9]/g, '_')}:DataAsset {name: '${id}'});\n`;
    }

    cypher += '\n// Create relationships\n';

    for (const [id, node] of this.lineageGraph) {
      const sourceVar = id.replace(/[^a-zA-Z0-9]/g, '_');

      for (const consumer of node.consumers || []) {
        const targetVar = consumer.name.replace(/[^a-zA-Z0-9]/g, '_');
        cypher += `MATCH (a:DataAsset {name: '${id}'}), (b:DataAsset {name: '${consumer.name}'}) `;
        cypher += `CREATE (a)-[:FLOWS_TO`;
        if (consumer.transformation) {
          cypher += ` {transformation: '${consumer.transformation}'}`;
        }
        cypher += `]->(b);\n`;
      }
    }

    return cypher;
  }
}