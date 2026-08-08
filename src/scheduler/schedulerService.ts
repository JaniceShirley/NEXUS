import { AgentService, TickResult } from '../agent/types.js';

export class SchedulerService {
  private agentService: AgentService;
  private intervalMinutes: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunningCycle = false;

  constructor(agentService: AgentService, intervalMinutes: number = 60) {
    this.agentService = agentService;
    this.intervalMinutes = intervalMinutes;
  }

  async checkAndAutoStart(): Promise<boolean> {
    const initialized = await this.agentService.isInitialized();
    if (initialized) {
      this.start();
      return true;
    }
    return false;
  }

  start(): void {
    if (this.timer !== null) {
      console.log('[SchedulerService] Autonomous scheduler timer is already active. Skipping duplicate timer creation.');
      return;
    }
    const ms = this.intervalMinutes * 60 * 1000;
    console.log(`[SchedulerService] Starting autonomous cycle timer (interval: ${this.intervalMinutes}m / ${ms}ms)`);

    this.timer = setInterval(async () => {
      await this.tick();
    }, ms);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[SchedulerService] Stopped autonomous cycle timer cleanly.');
    }
  }

  isTimerActive(): boolean {
    return this.timer !== null;
  }

  async tick(): Promise<TickResult | { status: string; reason?: string; error?: string }> {
    if (this.isRunningCycle) {
      console.log('[SchedulerService] Autonomous cycle already in progress, skipping concurrent tick.');
      return { status: 'busy', reason: 'Previous cycle still running' };
    }

    this.isRunningCycle = true;
    try {
      console.log(`[SchedulerService] Triggering autonomous cycle tick at ${new Date().toISOString()}`);
      const result = await this.agentService.runAutonomousCycle();
      console.log(`[SchedulerService] Autonomous cycle completed with status: ${result.status}`);
      return result;
    } catch (err: any) {
      console.error('[SchedulerService] Cycle execution error:', err);
      return { status: 'error', reason: String(err), error: err.message || String(err) };
    } finally {
      this.isRunningCycle = false;
    }
  }
}
