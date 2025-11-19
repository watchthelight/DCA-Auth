import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { Client as Square } from 'square';
import braintree from 'braintree';
import { Decimal } from 'decimal.js';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import PDFMake from 'pdfmake';

export enum PaymentProvider {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
  SQUARE = 'SQUARE',
  BRAINTREE = 'BRAINTREE',
  CRYPTO = 'CRYPTO',
  PADDLE = 'PADDLE',
  RAZORPAY = 'RAZORPAY',
  BANK_TRANSFER = 'BANK_TRANSFER'
}

export enum BillingModel {
  ONE_TIME = 'ONE_TIME',
  SUBSCRIPTION = 'SUBSCRIPTION',
  USAGE_BASED = 'USAGE_BASED',
  TIERED = 'TIERED',
  PER_SEAT = 'PER_SEAT',
  FREEMIUM = 'FREEMIUM',
  HYBRID = 'HYBRID'
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED'
}

export interface PaymentMethod {
  id: string;
  provider: PaymentProvider;
  type: 'card' | 'bank' | 'wallet' | 'crypto';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  metadata: any;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAt?: Date;
  cancelledAt?: Date;
  items: SubscriptionItem[];
  metadata: any;
}

export interface SubscriptionItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: Decimal;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  subscriptionId?: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
  discount?: Decimal;
  items: InvoiceItem[];
  dueDate: Date;
  paidAt?: Date;
  metadata: any;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: Decimal;
  amount: Decimal;
  taxRate?: number;
  metadata: any;
}

export interface UsageRecord {
  id: string;
  subscriptionId: string;
  metricName: string;
  quantity: number;
  timestamp: Date;
  metadata: any;
}

export class PaymentService extends EventEmitter {
  private prisma: PrismaClient;
  private providers: Map<PaymentProvider, any> = new Map();
  private taxRates: Map<string, number> = new Map();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.initializeProviders();
    this.loadTaxRates();
  }

  private initializeProviders() {
    // Initialize Stripe
    if (process.env.STRIPE_SECRET_KEY) {
      this.providers.set(
        PaymentProvider.STRIPE,
        new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2023-10-16',
        })
      );
    }

    // Initialize Square
    if (process.env.SQUARE_ACCESS_TOKEN) {
      this.providers.set(
        PaymentProvider.SQUARE,
        new Square({
          accessToken: process.env.SQUARE_ACCESS_TOKEN,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        })
      );
    }

    // Initialize Braintree
    if (process.env.BRAINTREE_MERCHANT_ID) {
      this.providers.set(
        PaymentProvider.BRAINTREE,
        braintree.connect({
          environment: braintree.Environment.Production,
          merchantId: process.env.BRAINTREE_MERCHANT_ID,
          publicKey: process.env.BRAINTREE_PUBLIC_KEY,
          privateKey: process.env.BRAINTREE_PRIVATE_KEY,
        })
      );
    }

    // Initialize other providers...
  }

  private async loadTaxRates() {
    // Load tax rates from configuration or external service
    this.taxRates.set('US', 0);
    this.taxRates.set('EU', 0.20); // Standard EU VAT
    this.taxRates.set('UK', 0.20);
    this.taxRates.set('CA', 0.13);
    // ... more tax rates
  }

  // ==================== Payment Processing ====================

  async processPayment(params: {
    amount: number;
    currency: string;
    provider: PaymentProvider;
    paymentMethodId?: string;
    customerId: string;
    description: string;
    metadata?: any;
  }): Promise<any> {
    const provider = this.providers.get(params.provider);

    if (!provider) {
      throw new Error(`Payment provider ${params.provider} not configured`);
    }

    try {
      let result;

      switch (params.provider) {
        case PaymentProvider.STRIPE:
          result = await this.processStripePayment(provider, params);
          break;
        case PaymentProvider.SQUARE:
          result = await this.processSquarePayment(provider, params);
          break;
        case PaymentProvider.BRAINTREE:
          result = await this.processBraintreePayment(provider, params);
          break;
        default:
          throw new Error(`Unsupported payment provider: ${params.provider}`);
      }

      // Record transaction
      await this.recordTransaction({
        amount: params.amount,
        currency: params.currency,
        provider: params.provider,
        customerId: params.customerId,
        status: 'SUCCESS',
        reference: result.id,
        metadata: params.metadata,
      });

      this.emit('payment:success', result);

      return result;
    } catch (error) {
      // Record failed transaction
      await this.recordTransaction({
        amount: params.amount,
        currency: params.currency,
        provider: params.provider,
        customerId: params.customerId,
        status: 'FAILED',
        error: error.message,
        metadata: params.metadata,
      });

      this.emit('payment:failed', { error, params });

      throw error;
    }
  }

  private async processStripePayment(stripe: Stripe, params: any) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100), // Convert to cents
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      description: params.description,
      confirm: true,
      metadata: params.metadata,
    });

    return paymentIntent;
  }

  private async processSquarePayment(square: Square, params: any) {
    const { result } = await square.paymentsApi.createPayment({
      sourceId: params.paymentMethodId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(params.amount * 100)),
        currency: params.currency.toUpperCase(),
      },
      customerId: params.customerId,
      note: params.description,
    });

    return result.payment;
  }

  private async processBraintreePayment(gateway: any, params: any) {
    const result = await gateway.transaction.sale({
      amount: params.amount.toFixed(2),
      paymentMethodNonce: params.paymentMethodId,
      customerId: params.customerId,
      options: {
        submitForSettlement: true,
      },
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return result.transaction;
  }

  // ==================== Subscription Management ====================

  async createSubscription(params: {
    userId: string;
    planId: string;
    provider: PaymentProvider;
    paymentMethodId?: string;
    trialDays?: number;
    coupon?: string;
    metadata?: any;
  }): Promise<Subscription> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: params.planId },
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const provider = this.providers.get(params.provider);

    let externalSubscription;

    switch (params.provider) {
      case PaymentProvider.STRIPE:
        externalSubscription = await this.createStripeSubscription(provider, {
          ...params,
          plan,
        });
        break;
      default:
        throw new Error(`Subscription not supported for ${params.provider}`);
    }

    // Create internal subscription record
    const subscription = await this.prisma.subscription.create({
      data: {
        id: crypto.randomUUID(),
        userId: params.userId,
        planId: params.planId,
        providerId: externalSubscription.id,
        provider: params.provider,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        trialEnd: params.trialDays
          ? new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000)
          : undefined,
        metadata: params.metadata,
      },
    });

    this.emit('subscription:created', subscription);

    return subscription as any;
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const provider = this.providers.get(subscription.provider as PaymentProvider);

    switch (subscription.provider) {
      case PaymentProvider.STRIPE:
        await this.cancelStripeSubscription(provider, subscription.providerId, immediately);
        break;
    }

    // Update internal record
    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: immediately ? 'cancelled' : 'active',
        cancelAt: immediately ? undefined : subscription.currentPeriodEnd,
        cancelledAt: immediately ? new Date() : undefined,
      },
    });

    this.emit('subscription:cancelled', updated);

    return updated as any;
  }

  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Provider-specific pause logic
    const provider = this.providers.get(subscription.provider as PaymentProvider);

    if (subscription.provider === PaymentProvider.STRIPE) {
      await provider.subscriptions.update(subscription.providerId, {
        pause_collection: {
          behavior: 'void',
        },
      });
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
      },
    });

    this.emit('subscription:paused', updated);

    return updated as any;
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const provider = this.providers.get(subscription.provider as PaymentProvider);

    if (subscription.provider === PaymentProvider.STRIPE) {
      await provider.subscriptions.update(subscription.providerId, {
        pause_collection: null,
      });
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'active',
        pausedAt: null,
      },
    });

    this.emit('subscription:resumed', updated);

    return updated as any;
  }

  // ==================== Usage-Based Billing ====================

  async recordUsage(params: {
    subscriptionId: string;
    metricName: string;
    quantity: number;
    timestamp?: Date;
    metadata?: any;
  }): Promise<UsageRecord> {
    const usage = await this.prisma.usageRecord.create({
      data: {
        id: crypto.randomUUID(),
        subscriptionId: params.subscriptionId,
        metricName: params.metricName,
        quantity: params.quantity,
        timestamp: params.timestamp || new Date(),
        metadata: params.metadata,
      },
    });

    // Check if usage exceeds limits
    await this.checkUsageLimits(params.subscriptionId, params.metricName);

    this.emit('usage:recorded', usage);

    return usage as any;
  }

  async calculateUsageCharges(
    subscriptionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ charges: any[]; total: Decimal }> {
    const usageRecords = await this.prisma.usageRecord.findMany({
      where: {
        subscriptionId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    const charges = [];
    let total = new Decimal(0);

    // Group usage by metric
    const usageByMetric = new Map<string, number>();

    for (const record of usageRecords) {
      const current = usageByMetric.get(record.metricName) || 0;
      usageByMetric.set(record.metricName, current + record.quantity);
    }

    // Calculate charges based on pricing model
    for (const [metric, quantity] of usageByMetric.entries()) {
      const pricing = subscription.plan.usagePricing[metric];

      if (!pricing) continue;

      const charge = this.calculateMetricCharge(quantity, pricing);

      charges.push({
        metric,
        quantity,
        unitPrice: pricing.unitPrice,
        amount: charge,
      });

      total = total.plus(charge);
    }

    return { charges, total };
  }

  private calculateMetricCharge(quantity: number, pricing: any): Decimal {
    let charge = new Decimal(0);

    switch (pricing.model) {
      case 'PER_UNIT':
        charge = new Decimal(quantity).times(pricing.unitPrice);
        break;

      case 'TIERED':
        let remaining = quantity;
        for (const tier of pricing.tiers) {
          const tierQuantity = Math.min(remaining, tier.upTo - (tier.from || 0));
          charge = charge.plus(new Decimal(tierQuantity).times(tier.unitPrice));
          remaining -= tierQuantity;
          if (remaining <= 0) break;
        }
        break;

      case 'VOLUME':
        // Find the tier that applies to the total quantity
        const applicableTier = pricing.tiers.find(
          t => quantity >= t.from && quantity <= t.upTo
        );
        if (applicableTier) {
          charge = new Decimal(quantity).times(applicableTier.unitPrice);
        }
        break;
    }

    return charge;
  }

  // ==================== Invoice Generation ====================

  async generateInvoice(params: {
    customerId: string;
    subscriptionId?: string;
    items: InvoiceItem[];
    dueDate: Date;
    metadata?: any;
  }): Promise<Invoice> {
    const customer = await this.prisma.user.findUnique({
      where: { id: params.customerId },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const taxRate = this.getTaxRate(customer.country);

    let subtotal = new Decimal(0);
    for (const item of params.items) {
      subtotal = subtotal.plus(item.amount);
    }

    const tax = subtotal.times(taxRate);
    const total = subtotal.plus(tax);

    const invoice = await this.prisma.invoice.create({
      data: {
        id: crypto.randomUUID(),
        number: await this.generateInvoiceNumber(),
        customerId: params.customerId,
        subscriptionId: params.subscriptionId,
        status: InvoiceStatus.PENDING,
        currency: customer.currency || 'USD',
        subtotal: subtotal.toNumber(),
        tax: tax.toNumber(),
        total: total.toNumber(),
        items: params.items as any,
        dueDate: params.dueDate,
        metadata: params.metadata,
      },
    });

    // Generate PDF
    await this.generateInvoicePDF(invoice);

    // Send invoice email
    await this.sendInvoiceEmail(invoice);

    this.emit('invoice:generated', invoice);

    return invoice as any;
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        number: {
          startsWith: `INV-${year}${month}`,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let sequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.number.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `INV-${year}${month}-${sequence.toString().padStart(4, '0')}`;
  }

  private getTaxRate(country: string): number {
    return this.taxRates.get(country) || 0;
  }

  // ==================== Payment Methods ====================

  async addPaymentMethod(params: {
    userId: string;
    provider: PaymentProvider;
    token: string;
    setAsDefault?: boolean;
  }): Promise<PaymentMethod> {
    const provider = this.providers.get(params.provider);

    let externalMethod;

    switch (params.provider) {
      case PaymentProvider.STRIPE:
        const stripe = provider as Stripe;
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card',
          card: { token: params.token },
        });

        await stripe.paymentMethods.attach(paymentMethod.id, {
          customer: params.userId,
        });

        externalMethod = paymentMethod;
        break;
    }

    const method = await this.prisma.paymentMethod.create({
      data: {
        id: crypto.randomUUID(),
        userId: params.userId,
        provider: params.provider,
        providerId: externalMethod.id,
        type: externalMethod.type,
        last4: externalMethod.card?.last4,
        brand: externalMethod.card?.brand,
        expiryMonth: externalMethod.card?.exp_month,
        expiryYear: externalMethod.card?.exp_year,
        isDefault: params.setAsDefault || false,
      },
    });

    if (params.setAsDefault) {
      await this.setDefaultPaymentMethod(params.userId, method.id);
    }

    this.emit('payment-method:added', method);

    return method as any;
  }

  async removePaymentMethod(userId: string, methodId: string): Promise<void> {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id: methodId },
    });

    if (!method || method.userId !== userId) {
      throw new Error('Payment method not found');
    }

    const provider = this.providers.get(method.provider as PaymentProvider);

    switch (method.provider) {
      case PaymentProvider.STRIPE:
        await provider.paymentMethods.detach(method.providerId);
        break;
    }

    await this.prisma.paymentMethod.delete({
      where: { id: methodId },
    });

    this.emit('payment-method:removed', { userId, methodId });
  }

  async setDefaultPaymentMethod(userId: string, methodId: string): Promise<void> {
    // Clear existing default
    await this.prisma.paymentMethod.updateMany({
      where: {
        userId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set new default
    await this.prisma.paymentMethod.update({
      where: { id: methodId },
      data: { isDefault: true },
    });

    this.emit('payment-method:default-changed', { userId, methodId });
  }

  // ==================== Refunds ====================

  async processRefund(params: {
    transactionId: string;
    amount?: number; // Partial refund if specified
    reason: string;
  }): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: params.transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const provider = this.providers.get(transaction.provider as PaymentProvider);
    const refundAmount = params.amount || transaction.amount;

    let refund;

    switch (transaction.provider) {
      case PaymentProvider.STRIPE:
        refund = await provider.refunds.create({
          payment_intent: transaction.providerId,
          amount: Math.round(refundAmount * 100),
          reason: params.reason,
        });
        break;
    }

    // Record refund
    await this.prisma.refund.create({
      data: {
        id: crypto.randomUUID(),
        transactionId: params.transactionId,
        amount: refundAmount,
        reason: params.reason,
        providerId: refund.id,
        status: 'COMPLETED',
        processedAt: new Date(),
      },
    });

    // Update invoice if applicable
    if (transaction.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: transaction.invoiceId },
        data: { status: InvoiceStatus.REFUNDED },
      });
    }

    this.emit('refund:processed', { transaction, refund, amount: refundAmount });

    return refund;
  }

  // ==================== Helpers ====================

  private async recordTransaction(data: any): Promise<void> {
    await this.prisma.transaction.create({ data });
  }

  private async checkUsageLimits(subscriptionId: string, metric: string): Promise<void> {
    // Implementation for checking usage limits
  }

  private async generateInvoicePDF(invoice: any): Promise<Buffer> {
    // PDF generation implementation
    return Buffer.from('PDF content');
  }

  private async sendInvoiceEmail(invoice: any): Promise<void> {
    // Email sending implementation
  }

  private async createStripeSubscription(stripe: Stripe, params: any) {
    return await stripe.subscriptions.create({
      customer: params.userId,
      items: [{ price: params.plan.stripePriceId }],
      trial_period_days: params.trialDays,
      coupon: params.coupon,
      metadata: params.metadata,
    });
  }

  private async cancelStripeSubscription(
    stripe: Stripe,
    subscriptionId: string,
    immediately: boolean
  ) {
    if (immediately) {
      await stripe.subscriptions.cancel(subscriptionId);
    } else {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }
}