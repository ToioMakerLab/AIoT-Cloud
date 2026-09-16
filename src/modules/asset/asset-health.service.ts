import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import type { AccessScope } from '../../common/access-scope.util.ts';
import { ResponseCore } from '../../common/dto/response-core.dto.ts';
import { clamp, computeAgeScore, computeConnectivityScore, roundTo } from '../../common/health-scoring.util.ts';
import { AssetHealthStatus } from '../../constants/asset-health-status.ts';
import { ErrorCode } from '../../constants/error-code.ts';
import { DeviceEntity } from '../device/device.entity.ts';
import { DeviceLifecycleService } from '../device/device-lifecycle.service.ts';
import { AssetEntity } from './asset.entity.ts';
import type { AssetHealthFactor, AssetHealthNodeBreakdown } from './dtos/asset-health.dto.ts';
import { AssetHealthAssessmentDto } from './dtos/asset-health.dto.ts';

/** Assumed service life for an asset with no explicit `expectedLifespanMonths` override — 5 years. */
const DEFAULT_EXPECTED_LIFESPAN_MONTHS = 60;

/**
 * Factor weights for the overall score — must sum to 1. Telemetry outweighs the others since it's the
 * most direct signal of the equipment's physical condition (over-current, overheating, vibration, ...);
 * connectivity reflects how much of that signal we can actually see right now.
 */
const AGE_WEIGHT = 0.2;
const CONNECTIVITY_WEIGHT = 0.3;
const TELEMETRY_WEIGHT = 0.5;

/** Checked in order (highest first); the first threshold the score clears wins. Below all of them: CRITICAL. */
const STATUS_SCORE_THRESHOLDS: { status: AssetHealthStatus; minScore: number }[] = [
  { status: AssetHealthStatus.HEALTHY, minScore: 80 },
  { status: AssetHealthStatus.WARNING, minScore: 50 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Average Gregorian month length — good enough for an age estimate, not for billing. */
const DAYS_PER_MONTH = 30.44;

/**
 * Computes and persists an asset's health index (0-100 + status bucket) from three weighted factors —
 * age vs. expected lifespan, and the connectivity/telemetry of every `DeviceEntity` node attached to it
 * (`DeviceEntity.assetId`), pooled with each node's configurable `healthWeight`. Mirrors
 * `DeviceLifecycleService.assessDevice`'s per-device scoring, rolled up across a whole piece of equipment.
 */
@Injectable()
export class AssetHealthService {
  private readonly logger = new Logger(AssetHealthService.name);

  constructor(
    @InjectRepository(AssetEntity)
    private assetRepository: Repository<AssetEntity>,
    @InjectRepository(DeviceEntity)
    private deviceRepository: Repository<DeviceEntity>,
    private deviceLifecycleService: DeviceLifecycleService,
  ) {}

  /** `scope: null` means unrestricted (GUEST) — can assess any asset. */
  async getAssessment(scope: AccessScope, id: string): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    const asset = await this.assetRepository.findOne({ where: scope ? { id, ...scope } : { id } });

    if (!asset) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    return ResponseCore.ok(await this.assessAsset(asset));
  }

  /** Recomputes and persists every asset's health index/status. */
  async assessAllAssets(): Promise<void> {
    const assets = await this.assetRepository.find();

    for (const asset of assets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.assessAsset(asset);
      } catch (error) {
        this.logger.error(`Failed to assess health for asset ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** Computes a fresh assessment for `asset` and persists it. */
  async assessAsset(asset: AssetEntity): Promise<AssetHealthAssessmentDto> {
    const now = new Date();
    const installedAt = asset.installedAt ?? asset.createdAt;
    const expectedLifespanMonths = asset.expectedLifespanMonths ?? DEFAULT_EXPECTED_LIFESPAN_MONTHS;
    const ageMonths = (now.getTime() - installedAt.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;

    const nodes = await this.deviceRepository.find({ where: { assetId: asset.id }, relations: ['template'] });

    const { factors, nodeBreakdown } = await this.computeFactors(nodes, ageMonths, expectedLifespanMonths, now);
    const score = nodes.length === 0 ? null : Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0));
    const status = this.deriveStatus(nodes.length, score);

    await this.assetRepository.update(asset.id, { healthIndex: score, healthStatus: status, healthAssessedAt: now });

    const assessment = new AssetHealthAssessmentDto();

    assessment.assetId = asset.id;
    assessment.status = status;
    assessment.score = score;
    assessment.installedAt = installedAt;
    assessment.expectedLifespanMonths = expectedLifespanMonths;
    assessment.ageMonths = roundTo(Math.max(0, ageMonths), 1);
    assessment.remainingLifespanMonths = roundTo(expectedLifespanMonths - ageMonths, 1);
    assessment.factors = factors;
    assessment.nodes = nodeBreakdown;
    assessment.assessedAt = now;

    return assessment;
  }

  private deriveStatus(nodeCount: number, score: number | null): AssetHealthStatus {
    if (nodeCount === 0 || score === null) {
      return AssetHealthStatus.UNKNOWN;
    }

    return STATUS_SCORE_THRESHOLDS.find((threshold) => score >= threshold.minScore)?.status ?? AssetHealthStatus.CRITICAL;
  }

  private async computeFactors(
    nodes: DeviceEntity[],
    ageMonths: number,
    expectedLifespanMonths: number,
    now: Date,
  ): Promise<{ factors: AssetHealthFactor[]; nodeBreakdown: AssetHealthNodeBreakdown[] }> {
    const ageFactor: AssetHealthFactor = {
      key: 'age',
      label: 'Asset age',
      score: computeAgeScore(ageMonths, expectedLifespanMonths),
      weight: AGE_WEIGHT,
      detail: `${roundTo(Math.max(0, ageMonths), 1)} of ${expectedLifespanMonths} expected months in service`,
    };

    if (nodes.length === 0) {
      const noSignalFactor = (key: AssetHealthFactor['key'], label: string, weight: number): AssetHealthFactor => ({
        key,
        label,
        score: 100,
        weight,
        detail: 'No device nodes attached yet',
      });

      return {
        factors: [
          ageFactor,
          noSignalFactor('connectivity', 'Connectivity', CONNECTIVITY_WEIGHT),
          noSignalFactor('telemetryHealth', 'Telemetry health', TELEMETRY_WEIGHT),
        ],
        nodeBreakdown: [],
      };
    }

    let weightedConnectivitySum = 0;
    let connectivityWeightTotal = 0;
    let weightedBreaches = 0;
    let weightedChecks = 0;
    const nodeBreakdown: AssetHealthNodeBreakdown[] = [];

    for (const node of nodes) {
      const weight = node.healthWeight;
      const connectivity = computeConnectivityScore(node.status, node.lastSeenAt, now);

      weightedConnectivitySum += connectivity.score * weight;
      connectivityWeightTotal += weight;

      // eslint-disable-next-line no-await-in-loop
      const { breaches, totalChecks } = await this.deviceLifecycleService.getTelemetryBreachCounts(node);

      weightedBreaches += breaches * weight;
      weightedChecks += totalChecks * weight;

      nodeBreakdown.push({ deviceId: node.id, name: node.name, status: node.status, healthWeight: weight, breaches, totalChecks });
    }

    const connectivityScore = connectivityWeightTotal > 0 ? Math.round(clamp(weightedConnectivitySum / connectivityWeightTotal, 0, 100)) : 100;

    const connectivityFactor: AssetHealthFactor = {
      key: 'connectivity',
      label: 'Connectivity',
      score: connectivityScore,
      weight: CONNECTIVITY_WEIGHT,
      detail: `Weighted average across ${nodes.length} node(s)`,
    };

    const telemetryScore = weightedChecks > 0 ? Math.round(clamp(100 * (1 - weightedBreaches / weightedChecks), 0, 100)) : 100;

    const telemetryFactor: AssetHealthFactor = {
      key: 'telemetryHealth',
      label: 'Telemetry health',
      score: telemetryScore,
      weight: TELEMETRY_WEIGHT,
      detail:
        weightedChecks > 0
          ? `${roundTo(weightedBreaches, 1)}/${roundTo(weightedChecks, 1)} weighted readings outside warning band across ${nodes.length} node(s)`
          : 'No warning bands configured across attached nodes',
    };

    return { factors: [ageFactor, connectivityFactor, telemetryFactor], nodeBreakdown };
  }
}
