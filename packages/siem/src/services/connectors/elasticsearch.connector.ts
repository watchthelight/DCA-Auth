import { Client } from '@elastic/elasticsearch';
import type { SIEMEvent } from '../siem.service';

export class ElasticsearchClient {
  private client: Client;
  private index: string;

  constructor(config: {
    nodes: string[];
    apiKey?: string;
    index?: string;
    cloudId?: string;
  }) {
    this.index = config.index || 'dca-auth-events';

    const clientConfig: any = {};

    if (config.cloudId) {
      clientConfig.cloud = { id: config.cloudId };
    } else {
      clientConfig.nodes = config.nodes;
    }

    if (config.apiKey) {
      clientConfig.auth = { apiKey: config.apiKey };
    }

    this.client = new Client(clientConfig);
    this.initializeIndex();
  }

  private async initializeIndex() {
    try {
      const exists = await this.client.indices.exists({
        index: this.index
      });

      if (!exists) {
        await this.client.indices.create({
          index: this.index,
          body: {
            mappings: {
              properties: {
                timestamp: { type: 'date' },
                severity: { type: 'keyword' },
                category: { type: 'keyword' },
                eventType: { type: 'keyword' },
                'source.service': { type: 'keyword' },
                'source.component': { type: 'keyword' },
                'source.hostname': { type: 'keyword' },
                'source.ip': { type: 'ip' },
                'user.id': { type: 'keyword' },
                'user.email': { type: 'keyword' },
                'user.role': { type: 'keyword' },
                details: { type: 'object', enabled: true },
                'metadata.correlationId': { type: 'keyword' },
                'metadata.sessionId': { type: 'keyword' },
                'metadata.requestId': { type: 'keyword' },
                'metadata.organizationId': { type: 'keyword' },
                tags: { type: 'keyword' }
              }
            },
            settings: {
              number_of_shards: 3,
              number_of_replicas: 1,
              'index.lifecycle.name': 'dca-auth-policy',
              'index.lifecycle.rollover_alias': 'dca-auth-events'
            }
          }
        });

        // Create ILM policy for log retention
        await this.client.ilm.putLifecycle({
          name: 'dca-auth-policy',
          body: {
            policy: {
              phases: {
                hot: {
                  min_age: '0ms',
                  actions: {
                    rollover: {
                      max_age: '30d',
                      max_size: '50GB'
                    }
                  }
                },
                warm: {
                  min_age: '30d',
                  actions: {
                    shrink: {
                      number_of_shards: 1
                    },
                    forcemerge: {
                      max_num_segments: 1
                    }
                  }
                },
                delete: {
                  min_age: '90d',
                  actions: {
                    delete: {}
                  }
                }
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize Elasticsearch index:', error);
    }
  }

  async send(events: SIEMEvent[]): Promise<void> {
    const body = events.flatMap(event => [
      { index: { _index: this.index } },
      this.transformEvent(event)
    ]);

    await this.client.bulk({ body, refresh: false });
  }

  private transformEvent(event: SIEMEvent): any {
    return {
      '@timestamp': event.timestamp,
      severity: event.severity,
      category: event.category,
      event_type: event.eventType,
      source: event.source,
      user: event.user,
      details: event.details,
      metadata: event.metadata,
      tags: event.tags
    };
  }

  async query(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): Promise<SIEMEvent[]> {
    const must: any[] = [
      {
        range: {
          '@timestamp': {
            gte: params.startTime.toISOString(),
            lte: params.endTime.toISOString()
          }
        }
      }
    ];

    if (params.categories?.length) {
      must.push({
        terms: { category: params.categories }
      });
    }

    if (params.severity?.length) {
      must.push({
        terms: { severity: params.severity }
      });
    }

    if (params.users?.length) {
      must.push({
        terms: { 'user.id': params.users }
      });
    }

    const result = await this.client.search({
      index: this.index,
      size: params.limit || 1000,
      body: {
        query: {
          bool: { must }
        },
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    return result.hits.hits.map((hit: any) => ({
      timestamp: new Date(hit._source['@timestamp']),
      severity: hit._source.severity,
      category: hit._source.category,
      eventType: hit._source.event_type,
      source: hit._source.source,
      user: hit._source.user,
      details: hit._source.details,
      metadata: hit._source.metadata,
      tags: hit._source.tags
    }));
  }

  async createAlert(rule: {
    name: string;
    condition: string;
    threshold: number;
    timeWindow: number;
    actions: Array<{ type: string; config: any }>;
  }): Promise<string> {
    // Create a Watcher alert
    const response = await this.client.watcher.putWatch({
      id: `dca-auth-${rule.name.toLowerCase().replace(/\s+/g, '-')}`,
      body: {
        trigger: {
          schedule: {
            interval: `${rule.timeWindow}m`
          }
        },
        input: {
          search: {
            request: {
              indices: [this.index],
              body: {
                query: {
                  bool: {
                    must: [
                      { query_string: { query: rule.condition } },
                      {
                        range: {
                          '@timestamp': {
                            gte: `now-${rule.timeWindow}m`
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        condition: {
          compare: {
            'ctx.payload.hits.total': {
              gte: rule.threshold
            }
          }
        },
        actions: this.transformActions(rule.actions)
      }
    });

    return response._id;
  }

  private transformActions(actions: Array<{ type: string; config: any }>) {
    const watcherActions: any = {};

    for (const action of actions) {
      switch (action.type) {
        case 'email':
          watcherActions.send_email = {
            email: {
              to: action.config.to,
              subject: action.config.subject,
              body: action.config.body
            }
          };
          break;
        case 'webhook':
          watcherActions.webhook = {
            webhook: {
              method: 'POST',
              url: action.config.url,
              body: '{{ctx.payload}}'
            }
          };
          break;
        case 'slack':
          watcherActions.slack = {
            webhook: {
              method: 'POST',
              url: action.config.webhookUrl,
              body: JSON.stringify({
                text: action.config.message
              })
            }
          };
          break;
      }
    }

    return watcherActions;
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}