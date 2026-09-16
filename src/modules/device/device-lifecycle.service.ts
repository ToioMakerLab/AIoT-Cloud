import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { MoreThanOrEqual, Not } from 'typeorm';

import type { AccessScope } from '../../common/access-scope.util.ts';
import { ResponseCore } from '../../common/dto/response-core.dto.ts';
import { clamp, computeAgeScore, computeConnectivityScore, roundTo } from '../../common/health-scoring.util.ts';
import { DeviceLifecycleStage } from '../../constants/device-lifecycle-stage.ts';
import { ErrorCode } from '../../constants/error-code.ts';
import { DeviceEntity } from './device.entity.ts';
import { DeviceTelemetryEntity } from './device-telemetry.entity.ts';
import type { DeviceLifecycleFactor, UpdateDeviceLifecycleDto } from './dtos/device-lifecycle.dto.ts';
import { DeviceLifecycleAssessmentDto } from './dtos/device-lifecycle.dto.ts';

/** Assumed service life for a device with no explicit `expectedLifespanMonths` override — 5 years. */
const DEFAULT_EXPECTED_LIFESPAN_MONTHS = 60;

/** Below this many days since install, with no heartbeat yet, a device stays NEW instead of being scored —
 * there just isn't enough connectivity/telemetry history yet for a score to mean anything. */
const NEW_STAGE_GRACE_DAYS = 14;

/** Telemetry lookback window/sample cap the telemetry-health factor's warning-band breach ratio is built from. */
const TELEMETRY_ASSESSMENT_WINDOW_DAYS = 30;
const TELEMETRY_ASSESSMENT_SAMPLE_LIMIT = 500;

/**
 * Factor weights for the overall score — must sum to 1. Connectivity and telemetry health outweigh age
 * since they reflect the device's actual observed condition rather than just time elapsed since install.
 */
const AGE_WEIGHT = 0.25;
const CONNECTIVITY_WEIGHT = 0.35;
const TELEMETRY_WEIGHT = 0.4;

/** Checked in order (highest first); the first threshold the score clears wins. Below all of them: END_OF_LIFE. */
const STAGE_SCORE_THRESHOLDS: { stage: DeviceLifecycleStage; minScore: number }[] = [
  { stage: DeviceLifecycleStage.ACTIVE, minScore: 80 },
  { stage: DeviceLifecycleStage.AGING, minScore: 60 },
  { stage: DeviceLifecycleStage.MAINTENANCE_DUE, minScore: 35 },
];

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Average Gregorian month length — good enough for an age estimate, not for billing. */
const DAYS_PER_MONTH = 30.44;

/**
 * Computes and persists a device's lifecycle health assessment (0-100 score + stage) from three
 * weighted factors — age vs. expected lifespan, current connectivity, and how often recent telemetry
 * has breached the template's warning bands. See docs/architecture.md for the wider device model;
 * DeviceLifecycleScheduler recomputes every non-decommissioned device on a daily cadence, and
 * GET .../lifecycle recomputes on demand (persisting the fresher result either way).
 */
@Injectable()
export class DeviceLifecycleService {
  private readonly logger = new Logger(DeviceLifecycleService.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceTelemetryEntity)
    private deviceTelemetryRepository: Repository<DeviceTelemetryEntity>,
  ) {}

  /** `scope: null` means unrestricted (GUEST) — can assess any device. */
  async getAssessment(scope: AccessScope, id: string): Promise<ResponseCore<DeviceLifecycleAssessmentDto>> {
    const device = await this.deviceRepository.findOne({ where: scope ? { id, ...scope } : { id }, relations: ['template'] });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    return ResponseCore.ok(await this.assessDevice(device));
  }

  async updateConfig(userId: string, id: string, dto: UpdateDeviceLifecycleDto): Promise<ResponseCore<DeviceLifecycleAssessmentDto>> {
    const device = await this.deviceRepository.findOne({ where: { id, userId }, relations: ['template'] });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    if (dto.installedAt !== undefined) {
      device.installedAt = dto.installedAt;
    }

    if (dto.expectedLifespanMonths !== undefined) {
      device.expectedLifespanMonths = dto.expectedLifespanMonths;
    }

    await this.deviceRepository.save(device);

    return ResponseCore.ok(await this.assessDevice(device));
  }

  /** Manually retires a device — DeviceLifecycleScheduler/assessDevice stop recomputing its stage once set. */
  async decommission(userId: string, id: string): Promise<ResponseCore<DeviceLifecycleAssessmentDto>> {
    const device = await this.deviceRepository.findOneBy({ id, userId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    const decommissionedAt = new Date();

    device.lifecycleStage = DeviceLifecycleStage.DECOMMISSIONED;
    device.decommissionedAt = decommissionedAt;
    device.lifecycleAssessedAt = decommissionedAt;
    device.lifecycleScore = null;

    await this.deviceRepository.save(device);

    return ResponseCore.ok(this.buildDecommissionedAssessment(device));
  }

  /** Recomputes and persists every non-decommissioned device's lifecycle stage/score. */
  async assessAllDevices(): Promise<void> {
    const devices = await this.deviceRepository.find({
      where: { lifecycleStage: Not(DeviceLifecycleStage.DECOMMISSIONED) },
      relations: ['template'],
    });

    for (const device of devices) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.assessDevice(device);
      } catch (error) {
        this.logger.error(`Failed to assess lifecycle for device ${device.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** Computes a fresh assessment for `device` (whose `template` relation must already be loaded) and persists it. */
  private async assessDevice(device: DeviceEntity): Promise<DeviceLifecycleAssessmentDto> {
    const now = new Date();
    const installedAt = device.installedAt ?? device.createdAt;
    const expectedLifespanMonths = device.expectedLifespanMonths ?? DEFAULT_EXPECTED_LIFESPAN_MONTHS;
    const ageMonths = (now.getTime() - installedAt.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;

    const factors: DeviceLifecycleFactor[] = [
      this.computeAgeFactor(ageMonths, expectedLifespanMonths),
      this.computeConnectivityFactor(device, now),
      await this.computeTelemetryHealthFactor(device),
    ];

    const score = Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0));
    const stage = this.deriveStage(device, score, installedAt, now);

    await this.deviceRepository.update(device.id, { lifecycleStage: stage, lifecycleScore: score, lifecycleAssessedAt: now });

    const assessment = new DeviceLifecycleAssessmentDto();

    assessment.deviceId = device.id;
    assessment.stage = stage;
    assessment.score = score;
    assessment.installedAt = installedAt;
    assessment.expectedLifespanMonths = expectedLifespanMonths;
    assessment.ageMonths = roundTo(Math.max(0, ageMonths), 1);
    assessment.remainingLifespanMonths = roundTo(expectedLifespanMonths - ageMonths, 1);
    assessment.factors = factors;
    assessment.assessedAt = now;
    assessment.decommissionedAt = device.decommissionedAt;

    return assessment;
  }

  /** Decommissioning short-circuits scoring entirely — nothing to compute once a device is retired. */
  private buildDecommissionedAssessment(device: DeviceEntity): DeviceLifecycleAssessmentDto {
    const installedAt = device.installedAt ?? device.createdAt;
    const expectedLifespanMonths = device.expectedLifespanMonths ?? DEFAULT_EXPECTED_LIFESPAN_MONTHS;
    const now = device.lifecycleAssessedAt ?? new Date();

    const assessment = new DeviceLifecycleAssessmentDto();

    assessment.deviceId = device.id;
    assessment.stage = DeviceLifecycleStage.DECOMMISSIONED;
    assessment.score = 0;
    assessment.installedAt = installedAt;
    assessment.expectedLifespanMonths = expectedLifespanMonths;
    assessment.ageMonths = roundTo(Math.max(0, (now.getTime() - installedAt.getTime()) / MS_PER_DAY / DAYS_PER_MONTH), 1);
    assessment.remainingLifespanMonths = 0;
    assessment.factors = [];
    assessment.assessedAt = now;
    assessment.decommissionedAt = device.decommissionedAt;

    return assessment;
  }

  /** DECOMMISSIONED is sticky (only `decommission()` sets or clears it); everything else is derived from `score`. */
  private deriveStage(device: DeviceEntity, score: number, installedAt: Date, now: Date): DeviceLifecycleStage {
    if (device.lifecycleStage === DeviceLifecycleStage.DECOMMISSIONED) {
      return DeviceLifecycleStage.DECOMMISSIONED;
    }

    const daysSinceInstall = (now.getTime() - installedAt.getTime()) / MS_PER_DAY;

    if (daysSinceInstall < NEW_STAGE_GRACE_DAYS && !device.lastSeenAt) {
      return DeviceLifecycleStage.NEW;
    }

    return STAGE_SCORE_THRESHOLDS.find((threshold) => score >= threshold.minScore)?.stage ?? DeviceLifecycleStage.END_OF_LIFE;
  }

  private computeAgeFactor(ageMonths: number, expectedLifespanMonths: number): DeviceLifecycleFactor {
    return {
      key: 'age',
      label: 'Device age',
      score: computeAgeScore(ageMonths, expectedLifespanMonths),
      weight: AGE_WEIGHT,
      detail: `${roundTo(Math.max(0, ageMonths), 1)} of ${expectedLifespanMonths} expected months in service`,
    };
  }

  private computeConnectivityFactor(device: DeviceEntity, now: Date): DeviceLifecycleFactor {
    const { score, detail } = computeConnectivityScore(device.status, device.lastSeenAt, now);

    return { key: 'connectivity', label: 'Connectivity', score, weight: CONNECTIVITY_WEIGHT, detail };
  }

  /** No telemetry schema, no recent samples, or no warning bands configured are all treated as "no signal" (score 100) rather than penalized. */
  private async computeTelemetryHealthFactor(device: DeviceEntity): Promise<DeviceLifecycleFactor> {
    const { breaches, totalChecks, detail } = await this.getTelemetryBreachCounts(device);

    if (totalChecks === 0) {
      return { key: 'telemetryHealth', label: 'Telemetry health', score: 100, weight: TELEMETRY_WEIGHT, detail };
    }

    const breachRatio = breaches / totalChecks;
    const score = Math.round(clamp(100 * (1 - breachRatio), 0, 100));

    return { key: 'telemetryHealth', label: 'Telemetry health', score, weight: TELEMETRY_WEIGHT, detail };
  }

  /**
   * Counts, across `device`'s recent telemetry, how many warning-band checks were performed and how
   * many were breached — the raw signal `computeTelemetryHealthFactor` turns into a 0-100 score for a
   * single device, and that `AssetHealthService` pools (weighted) across every node attached to an asset.
   */
  async getTelemetryBreachCounts(device: DeviceEntity): Promise<{ breaches: number; totalChecks: number; detail: string }> {
    const schema = device.template?.telemetrySchema;

    if (!schema?.length) {
      return { breaches: 0, totalChecks: 0, detail: 'Template has no telemetry schema to evaluate' };
    }

    const since = new Date(Date.now() - TELEMETRY_ASSESSMENT_WINDOW_DAYS * MS_PER_DAY);
    const records = await this.deviceTelemetryRepository.find({
      where: { deviceId: device.id, recordedAt: MoreThanOrEqual(since) },
      order: { recordedAt: 'DESC' },
      take: TELEMETRY_ASSESSMENT_SAMPLE_LIMIT,
    });

    if (records.length === 0) {
      return { breaches: 0, totalChecks: 0, detail: `No telemetry in the last ${TELEMETRY_ASSESSMENT_WINDOW_DAYS} days` };
    }

    let totalChecks = 0;
    let breaches = 0;

    for (const record of records) {
      for (const field of schema) {
        const value = record.payload[field.key];

        if (typeof value !== 'number') {
          continue;
        }

        const override = device.warningOverrides?.[field.key];

        if (override?.enabled === false) {
          continue;
        }

        const min = override?.min ?? field.warningMin;
        const max = override?.max ?? field.warningMax;

        if (min === undefined && max === undefined) {
          continue;
        }

        totalChecks += 1;

        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          breaches += 1;
        }
      }
    }

    if (totalChecks === 0) {
      return { breaches: 0, totalChecks: 0, detail: 'No warning bands configured for this template' };
    }

    return {
      breaches,
      totalChecks,
      detail: `${breaches}/${totalChecks} readings outside warning band across ${records.length} samples over the last ${TELEMETRY_ASSESSMENT_WINDOW_DAYS} days`,
    };
  }
}
