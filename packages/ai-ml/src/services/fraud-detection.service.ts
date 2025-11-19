import * as tf from '@tensorflow/tfjs-node';
import { NeuralNetwork } from 'brain.js';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'redis';
import { EventEmitter } from 'events';

export interface FraudDetectionResult {
  score: number; // 0-1, where 1 is highly suspicious
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: FraudFactor[];
  recommendations: string[];
  requiresManualReview: boolean;
}

export interface FraudFactor {
  name: string;
  weight: number;
  value: any;
  contribution: number;
}

export interface LicenseActivityPattern {
  userId: string;
  licenseId: string;
  activationPattern: {
    frequency: number;
    locations: string[];
    devices: string[];
    timeDistribution: number[];
  };
  behaviorMetrics: {
    averageSessionDuration: number;
    activationVelocity: number;
    geographicSpread: number;
    deviceSwitchingRate: number;
  };
}

export class FraudDetectionService extends EventEmitter {
  private model: tf.LayersModel | null = null;
  private neuralNetwork: NeuralNetwork;
  private prisma: PrismaClient;
  private redis: Redis;
  private readonly modelPath = './models/fraud-detection';
  private readonly thresholds = {
    low: 0.3,
    medium: 0.6,
    high: 0.8,
    critical: 0.95,
  };

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    this.neuralNetwork = new NeuralNetwork({
      hiddenLayers: [20, 10],
      activation: 'sigmoid',
    });

    this.initialize();
  }

  private async initialize() {
    await this.loadModel();
    await this.loadTrainingData();
    this.startRealtimeAnalysis();
  }

  private async loadModel() {
    try {
      // Load pre-trained TensorFlow model
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      console.log('Fraud detection model loaded successfully');
    } catch (error) {
      console.log('No pre-trained model found, will train on first run');
      await this.trainModel();
    }
  }

  private async trainModel() {
    const trainingData = await this.prepareTrainingData();

    // Create TensorFlow model
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [15], // 15 input features
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid', // Binary classification
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall'],
    });

    // Convert training data to tensors
    const features = tf.tensor2d(trainingData.features);
    const labels = tf.tensor2d(trainingData.labels, [trainingData.labels.length, 1]);

    // Train the model
    await model.fit(features, labels, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs?.loss}, accuracy = ${logs?.acc}`);
        },
      },
    });

    // Save the model
    await model.save(`file://${this.modelPath}`);
    this.model = model;

    // Clean up tensors
    features.dispose();
    labels.dispose();
  }

  async detectFraud(data: {
    userId: string;
    licenseKey: string;
    hardwareId: string;
    ipAddress: string;
    deviceInfo?: any;
    location?: { lat: number; lon: number };
    timestamp: Date;
  }): Promise<FraudDetectionResult> {
    const features = await this.extractFeatures(data);
    const prediction = await this.predict(features);
    const factors = await this.analyzeFactors(data, features, prediction);

    const riskLevel = this.calculateRiskLevel(prediction);
    const recommendations = this.generateRecommendations(riskLevel, factors);

    const result: FraudDetectionResult = {
      score: prediction,
      riskLevel,
      factors,
      recommendations,
      requiresManualReview: riskLevel === 'high' || riskLevel === 'critical',
    };

    // Store result for audit
    await this.storeDetectionResult(data, result);

    // Emit event for high-risk detections
    if (result.requiresManualReview) {
      this.emit('high-risk-detected', { data, result });
    }

    return result;
  }

  private async extractFeatures(data: any): Promise<number[]> {
    const features: number[] = [];

    // Time-based features
    const hour = new Date(data.timestamp).getHours();
    const dayOfWeek = new Date(data.timestamp).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const isNightTime = hour < 6 || hour > 22 ? 1 : 0;

    features.push(hour / 24); // Normalize hour
    features.push(dayOfWeek / 7); // Normalize day of week
    features.push(isWeekend);
    features.push(isNightTime);

    // User behavior features
    const userStats = await this.getUserStatistics(data.userId);
    features.push(userStats.activationCount / 100); // Normalize
    features.push(userStats.uniqueDevices / 10);
    features.push(userStats.averageActivationsPerDay);
    features.push(userStats.daysSinceFirstActivation / 365);

    // Geographic features
    const geoData = await this.analyzeGeographicPattern(data.userId, data.ipAddress);
    features.push(geoData.distanceFromUsualLocation / 1000); // Normalize to 1000km
    features.push(geoData.countryChangeCount / 10);
    features.push(geoData.vpnProbability);

    // Device features
    const deviceData = await this.analyzeDevicePattern(data.hardwareId);
    features.push(deviceData.activationVelocity);
    features.push(deviceData.sharedDeviceScore);
    features.push(deviceData.hardwareChangeFrequency);

    // License features
    const licenseData = await this.analyzeLicenseUsage(data.licenseKey);
    features.push(licenseData.utilizationRate);

    return features;
  }

  private async predict(features: number[]): Promise<number> {
    if (!this.model) {
      // Fallback to neural network if TensorFlow model not available
      const result = this.neuralNetwork.run(features) as any;
      return result[0] || 0.5;
    }

    const input = tf.tensor2d([features]);
    const prediction = this.model.predict(input) as tf.Tensor;
    const score = (await prediction.data())[0];

    input.dispose();
    prediction.dispose();

    return score;
  }

  private async analyzeFactors(
    data: any,
    features: number[],
    prediction: number
  ): Promise<FraudFactor[]> {
    const factors: FraudFactor[] = [];

    // Analyze each feature's contribution
    const featureNames = [
      'Time of Day',
      'Day of Week',
      'Weekend Activity',
      'Night Time Activity',
      'Total Activations',
      'Unique Devices',
      'Daily Activation Rate',
      'Account Age',
      'Geographic Distance',
      'Country Changes',
      'VPN Usage',
      'Device Velocity',
      'Shared Device',
      'Hardware Changes',
      'License Utilization',
    ];

    for (let i = 0; i < features.length; i++) {
      const contribution = await this.calculateFeatureContribution(i, features, prediction);

      if (contribution > 0.1) { // Only include significant factors
        factors.push({
          name: featureNames[i],
          weight: contribution,
          value: features[i],
          contribution: contribution * prediction,
        });
      }
    }

    // Sort by contribution
    factors.sort((a, b) => b.contribution - a.contribution);

    return factors;
  }

  private async calculateFeatureContribution(
    featureIndex: number,
    features: number[],
    baselinePrediction: number
  ): Promise<number> {
    // Permutation importance: see how prediction changes when feature is permuted
    const permutedFeatures = [...features];
    permutedFeatures[featureIndex] = Math.random(); // Randomize the feature

    const permutedPrediction = await this.predict(permutedFeatures);
    const contribution = Math.abs(baselinePrediction - permutedPrediction);

    return contribution;
  }

  private calculateRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.thresholds.critical) return 'critical';
    if (score >= this.thresholds.high) return 'high';
    if (score >= this.thresholds.medium) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    riskLevel: string,
    factors: FraudFactor[]
  ): string[] {
    const recommendations: string[] = [];

    switch (riskLevel) {
      case 'critical':
        recommendations.push('Immediately suspend the license pending review');
        recommendations.push('Contact the user for verification');
        recommendations.push('Review all recent activities from this user');
        break;

      case 'high':
        recommendations.push('Flag for manual review');
        recommendations.push('Require additional verification for next activation');
        recommendations.push('Monitor closely for next 24 hours');
        break;

      case 'medium':
        recommendations.push('Send security notification to user');
        recommendations.push('Log for pattern analysis');
        recommendations.push('Consider implementing 2FA if not enabled');
        break;

      case 'low':
        recommendations.push('Continue normal monitoring');
        break;
    }

    // Add factor-specific recommendations
    for (const factor of factors.slice(0, 3)) { // Top 3 factors
      if (factor.name === 'VPN Usage' && factor.value > 0.7) {
        recommendations.push('Detected VPN usage - verify if legitimate');
      }
      if (factor.name === 'Geographic Distance' && factor.value > 0.8) {
        recommendations.push('Unusual geographic location - verify travel');
      }
      if (factor.name === 'Device Velocity' && factor.value > 0.9) {
        recommendations.push('Rapid device switching detected - possible sharing');
      }
    }

    return recommendations;
  }

  private async getUserStatistics(userId: string) {
    const cacheKey = `user:stats:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const stats = await this.prisma.activation.aggregate({
      where: { license: { userId } },
      _count: true,
    });

    const uniqueDevices = await this.prisma.activation.groupBy({
      by: ['hardwareId'],
      where: { license: { userId } },
    });

    const firstActivation = await this.prisma.activation.findFirst({
      where: { license: { userId } },
      orderBy: { activatedAt: 'asc' },
    });

    const daysSinceFirst = firstActivation
      ? Math.floor((Date.now() - firstActivation.activatedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const result = {
      activationCount: stats._count,
      uniqueDevices: uniqueDevices.length,
      averageActivationsPerDay: daysSinceFirst > 0 ? stats._count / daysSinceFirst : 0,
      daysSinceFirstActivation: daysSinceFirst,
    };

    await this.redis.setEx(cacheKey, 300, JSON.stringify(result)); // Cache for 5 minutes

    return result;
  }

  private async analyzeGeographicPattern(userId: string, ipAddress: string) {
    // This would integrate with a GeoIP service
    // Simplified version for demonstration
    return {
      distanceFromUsualLocation: Math.random() * 500, // km
      countryChangeCount: Math.floor(Math.random() * 3),
      vpnProbability: Math.random() * 0.3, // 0-0.3 probability
    };
  }

  private async analyzeDevicePattern(hardwareId: string) {
    const activations = await this.prisma.activation.findMany({
      where: { hardwareId },
      orderBy: { activatedAt: 'desc' },
      take: 10,
    });

    const velocity = activations.length > 1
      ? activations.length / ((Date.now() - activations[activations.length - 1].activatedAt.getTime()) / (1000 * 60 * 60))
      : 0;

    return {
      activationVelocity: Math.min(velocity / 10, 1), // Normalize
      sharedDeviceScore: activations.length > 5 ? 0.8 : 0.2,
      hardwareChangeFrequency: 0.1, // Placeholder
    };
  }

  private async analyzeLicenseUsage(licenseKey: string) {
    const license = await this.prisma.license.findUnique({
      where: { key: licenseKey },
    });

    if (!license) {
      return { utilizationRate: 0 };
    }

    return {
      utilizationRate: license.currentActivations / license.maxActivations,
    };
  }

  private async storeDetectionResult(data: any, result: FraudDetectionResult) {
    await this.prisma.fraudDetection.create({
      data: {
        userId: data.userId,
        licenseKey: data.licenseKey,
        score: result.score,
        riskLevel: result.riskLevel,
        factors: result.factors as any,
        recommendations: result.recommendations,
        requiresReview: result.requiresManualReview,
        timestamp: new Date(),
      },
    });

    // Update cache
    await this.redis.hSet(
      `fraud:scores`,
      data.userId,
      JSON.stringify({ score: result.score, timestamp: Date.now() })
    );
  }

  private async prepareTrainingData() {
    // Load historical data and prepare for training
    const fraudulentCases = await this.prisma.fraudDetection.findMany({
      where: { confirmed: true },
    });

    const legitimateCases = await this.prisma.activation.findMany({
      where: { flaggedAsFraud: false },
      take: fraudulentCases.length * 3, // Balance dataset
    });

    const features: number[][] = [];
    const labels: number[] = [];

    // Process fraudulent cases
    for (const case_ of fraudulentCases) {
      const f = await this.extractFeatures(case_);
      features.push(f);
      labels.push(1); // Fraudulent
    }

    // Process legitimate cases
    for (const case_ of legitimateCases) {
      const f = await this.extractFeatures(case_);
      features.push(f);
      labels.push(0); // Legitimate
    }

    return { features, labels };
  }

  private async loadTrainingData() {
    // Load pre-processed training data if available
    try {
      const data = await this.redis.get('fraud:training:data');
      if (data) {
        const parsed = JSON.parse(data);
        this.neuralNetwork.train(parsed);
      }
    } catch (error) {
      console.log('No training data available');
    }
  }

  private startRealtimeAnalysis() {
    // Set up real-time analysis pipeline
    setInterval(async () => {
      await this.analyzeRecentActivities();
    }, 60000); // Every minute

    console.log('Real-time fraud analysis started');
  }

  private async analyzeRecentActivities() {
    const recentActivations = await this.prisma.activation.findMany({
      where: {
        activatedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
      include: {
        license: true,
      },
    });

    for (const activation of recentActivations) {
      const result = await this.detectFraud({
        userId: activation.license.userId,
        licenseKey: activation.license.key,
        hardwareId: activation.hardwareId,
        ipAddress: activation.ipAddress || '',
        timestamp: activation.activatedAt,
      });

      if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
        this.emit('suspicious-activity', {
          activation,
          fraudResult: result,
        });
      }
    }
  }

  async getAnomalyScore(userId: string): Promise<number> {
    const cached = await this.redis.hGet('fraud:scores', userId);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < 300000) { // 5 minutes
        return parsed.score;
      }
    }

    // Calculate fresh score
    const userActivations = await this.prisma.activation.findMany({
      where: { license: { userId } },
      orderBy: { activatedAt: 'desc' },
      take: 10,
    });

    if (userActivations.length === 0) {
      return 0;
    }

    let totalScore = 0;
    for (const activation of userActivations) {
      const result = await this.detectFraud({
        userId,
        licenseKey: activation.licenseId,
        hardwareId: activation.hardwareId,
        ipAddress: activation.ipAddress || '',
        timestamp: activation.activatedAt,
      });
      totalScore += result.score;
    }

    return totalScore / userActivations.length;
  }

  async trainOnNewData(feedbackData: {
    caseId: string;
    wasFraudulent: boolean;
    confidence: number;
  }) {
    // Update model with new feedback
    const case_ = await this.prisma.fraudDetection.findUnique({
      where: { id: feedbackData.caseId },
    });

    if (case_) {
      await this.prisma.fraudDetection.update({
        where: { id: feedbackData.caseId },
        data: {
          confirmed: feedbackData.wasFraudulent,
          confidence: feedbackData.confidence,
        },
      });

      // Retrain model periodically with new data
      // This would typically be done in a background job
      this.emit('retrain-needed', { reason: 'new-feedback' });
    }
  }
}