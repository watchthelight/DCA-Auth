import { Prisma } from '@prisma/client';

export class QueryOptimizer {
  /**
   * Optimize license queries with selective includes
   */
  static getLicenseInclude(fields?: string[]): Prisma.LicenseInclude {
    if (!fields || fields.length === 0) {
      // Default minimal include
      return {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            activations: true,
          },
        },
      };
    }

    const include: Prisma.LicenseInclude = {};

    if (fields.includes('user')) {
      include.user = {
        select: {
          id: true,
          email: true,
          username: true,
          discordId: fields.includes('user.discord'),
        },
      };
    }

    if (fields.includes('product')) {
      include.product = true;
    }

    if (fields.includes('activations')) {
      include.activations = {
        take: fields.includes('activations.all') ? undefined : 10,
        orderBy: { lastSeenAt: 'desc' },
      };
    } else {
      include._count = {
        select: {
          activations: true,
        },
      };
    }

    return include;
  }

  /**
   * Create optimized pagination parameters
   */
  static getPaginationParams(
    page: number = 1,
    limit: number = 10,
    maxLimit: number = 100
  ): { skip: number; take: number } {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), maxLimit);

    return {
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    };
  }

  /**
   * Build optimized where clause with search
   */
  static buildSearchWhere<T>(
    search?: string,
    searchFields: string[] = [],
    additionalWhere: any = {}
  ): any {
    if (!search || searchFields.length === 0) {
      return additionalWhere;
    }

    const searchConditions = searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive' as Prisma.QueryMode,
      },
    }));

    return {
      AND: [
        additionalWhere,
        {
          OR: searchConditions,
        },
      ],
    };
  }

  /**
   * Create efficient sort order
   */
  static getSortOrder(
    sort?: string,
    order: 'asc' | 'desc' = 'desc',
    allowedFields: string[] = []
  ): any {
    if (!sort || !allowedFields.includes(sort)) {
      return { createdAt: 'desc' };
    }

    // Handle nested sorting
    if (sort.includes('.')) {
      const [relation, field] = sort.split('.');
      return {
        [relation]: {
          [field]: order,
        },
      };
    }

    return { [sort]: order };
  }

  /**
   * Batch database operations for efficiency
   */
  static createBatchProcessor<T>(
    batchSize: number = 100,
    processFn: (batch: T[]) => Promise<void>
  ) {
    let batch: T[] = [];
    let timeout: NodeJS.Timeout;

    const flush = async () => {
      if (batch.length > 0) {
        const currentBatch = [...batch];
        batch = [];
        await processFn(currentBatch);
      }
    };

    const add = async (item: T) => {
      batch.push(item);

      if (batch.length >= batchSize) {
        await flush();
      } else {
        // Auto-flush after 100ms of inactivity
        clearTimeout(timeout);
        timeout = setTimeout(flush, 100);
      }
    };

    return { add, flush };
  }

  /**
   * Create database indices recommendations
   */
  static getIndexRecommendations(): string[] {
    return [
      // User indices
      'CREATE INDEX idx_user_email ON "User"(email);',
      'CREATE INDEX idx_user_discord_id ON "User"("discordId");',

      // License indices
      'CREATE INDEX idx_license_key ON "License"(key);',
      'CREATE INDEX idx_license_user_id ON "License"("userId");',
      'CREATE INDEX idx_license_product_id ON "License"("productId");',
      'CREATE INDEX idx_license_status ON "License"(status);',
      'CREATE INDEX idx_license_expires_at ON "License"("expiresAt");',

      // Activation indices
      'CREATE INDEX idx_activation_license_id ON "Activation"("licenseId");',
      'CREATE INDEX idx_activation_hardware_id ON "Activation"("hardwareId");',
      'CREATE INDEX idx_activation_last_seen ON "Activation"("lastSeenAt");',

      // Compound indices for common queries
      'CREATE INDEX idx_license_user_status ON "License"("userId", status);',
      'CREATE INDEX idx_activation_license_hardware ON "Activation"("licenseId", "hardwareId");',

      // Full text search indices
      'CREATE INDEX idx_user_search ON "User" USING GIN(to_tsvector(\'english\', username || \' \' || email));',
      'CREATE INDEX idx_product_search ON "Product" USING GIN(to_tsvector(\'english\', name || \' \' || description));',
    ];
  }
}

/**
 * Connection pooling configuration
 */
export const optimizedPrismaConfig: Prisma.PrismaClientOptions = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
  errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
};

/**
 * Query result cache decorator
 */
export function CacheResult(ttl: number = 60) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cache = new Map<string, { data: any; expires: number }>();

    descriptor.value = async function (...args: any[]) {
      const key = `${propertyKey}:${JSON.stringify(args)}`;
      const cached = cache.get(key);

      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }

      const result = await originalMethod.apply(this, args);

      cache.set(key, {
        data: result,
        expires: Date.now() + ttl * 1000,
      });

      // Clean expired entries periodically
      if (Math.random() < 0.1) {
        for (const [k, v] of cache.entries()) {
          if (v.expires <= Date.now()) {
            cache.delete(k);
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}